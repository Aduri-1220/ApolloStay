import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { ErrorCard, LoadingCard } from "@/components/AsyncState";
import { PrimaryButton } from "@/components/PrimaryButton";
import { getMedicalRecord, reparseMedicalRecordText, updateMedicalRecordValues } from "@/lib/api";
import { MedicalRecord } from "@/lib/types";
import { palette, radii, spacing, typography } from "@/lib/theme";

type EditableObservation = {
  name: string;
  value: string;
  unit: string;
};

function listToMultiline(values: string[]) {
  return values.join("\n");
}

function multilineToList(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function observationsToEditable(
  items: Array<{ name: string; value: number | string | null; unit: string | null }>
) {
  return items.map((item) => ({
    name: item.name || "",
    value: item.value === null || item.value === undefined ? "" : String(item.value),
    unit: item.unit || ""
  }));
}

function editableToObservations(items: EditableObservation[]) {
  return items
    .map((item) => ({
      name: item.name.trim(),
      value: item.value.trim() === "" ? null : item.value.trim(),
      unit: item.unit.trim() || null
    }))
    .filter((item) => item.name);
}

function formatProvider(provider?: string) {
  return provider ? provider.replace(/_/g, " ") : "Local parser";
}

function formatConfidence(confidence?: number) {
  if (typeof confidence !== "number") {
    return "Unknown confidence";
  }

  return `${Math.round(confidence * 100)}% confidence`;
}

export default function MedicalRecordReviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const recordId = typeof params.id === "string" ? params.id : "";
  const [record, setRecord] = useState<MedicalRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reparsing, setReparsing] = useState(false);
  const [showAdvancedReview, setShowAdvancedReview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [sourceText, setSourceText] = useState("");
  const [summary, setSummary] = useState("");
  const [recordDate, setRecordDate] = useState("");
  const [diagnoses, setDiagnoses] = useState("");
  const [medications, setMedications] = useState("");
  const [allergies, setAllergies] = useState("");
  const [dietaryFlags, setDietaryFlags] = useState("");
  const [vitals, setVitals] = useState<EditableObservation[]>([]);
  const [labs, setLabs] = useState<EditableObservation[]>([]);

  const loadRecord = useCallback(() => {
    if (!recordId) {
      setError("Medical record not found.");
      setLoading(false);
      return;
    }

    setLoading(true);
    getMedicalRecord(recordId)
      .then((response) => {
        setRecord(response);
        setSourceText(response.sourceText || "");
        setSummary(response.extracted.summary || "");
        setRecordDate(response.extracted.recordDate || "");
        setDiagnoses(listToMultiline(response.extracted.diagnoses));
        setMedications(listToMultiline(response.extracted.medications));
        setAllergies(listToMultiline(response.extracted.allergies));
        setDietaryFlags(listToMultiline(response.extracted.dietaryFlags));
        setVitals(observationsToEditable(response.extracted.vitals));
        setLabs(observationsToEditable(response.extracted.labResults));
        setError(null);
      })
      .catch((requestError: Error) => {
        setError(requestError.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [recordId]);

  useEffect(() => {
    loadRecord();
  }, [loadRecord]);

  const reviewedExtracted = useMemo(
    () => ({
      provider: "manual_review",
      confidence: 0.95,
      summary: summary.trim(),
      recordDate: recordDate.trim() || null,
      diagnoses: multilineToList(diagnoses),
      medications: multilineToList(medications),
      medicationContexts: record?.extracted.medicationContexts || [],
      allergies: multilineToList(allergies),
      dietaryFlags: multilineToList(dietaryFlags),
      vitals: editableToObservations(vitals).map((item) => ({
        ...item,
        observedAt: null
      })),
      labResults: editableToObservations(labs).map((item) => ({
        ...item,
        referenceRange: null,
        interpretation: null,
        observedAt: null
      }))
    }),
    [summary, recordDate, diagnoses, medications, allergies, dietaryFlags, vitals, labs, record]
  );

  const updateObservation = (
    setter: Dispatch<SetStateAction<EditableObservation[]>>,
    index: number,
    key: keyof EditableObservation,
    value: string
  ) => {
    setter((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)));
  };

  const addObservation = (setter: Dispatch<SetStateAction<EditableObservation[]>>) => {
    setter((current) => [...current, { name: "", value: "", unit: "" }]);
  };

  const removeObservation = (setter: Dispatch<SetStateAction<EditableObservation[]>>, index: number) => {
    setter((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleSave = async () => {
    if (!recordId) {
      return;
    }

    setSaving(true);
    try {
      const updated = await updateMedicalRecordValues(recordId, reviewedExtracted);
      setRecord(updated);
      setSaveMessage("Medical values saved.");
      setError(null);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleReparseFromText = async () => {
    if (!recordId) {
      return;
    }

    setReparsing(true);
    try {
      const updated = await reparseMedicalRecordText(recordId, sourceText);
      setRecord(updated);
      setSummary(updated.extracted.summary || "");
      setRecordDate(updated.extracted.recordDate || "");
      setDiagnoses(listToMultiline(updated.extracted.diagnoses));
      setMedications(listToMultiline(updated.extracted.medications));
      setAllergies(listToMultiline(updated.extracted.allergies));
      setDietaryFlags(listToMultiline(updated.extracted.dietaryFlags));
      setVitals(observationsToEditable(updated.extracted.vitals));
      setLabs(observationsToEditable(updated.extracted.labResults));
      setSaveMessage("Local parser reran using the reviewed text.");
      setError(null);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setReparsing(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? <LoadingCard label="Loading medical record..." /> : null}
        {error ? <ErrorCard message={error} /> : null}

        {record ? (
          <>
            <View style={styles.headerCard}>
              <Text style={styles.title}>Medical readings</Text>
              <Text style={styles.subtitle}>{record.filename}</Text>
              <View style={styles.statusRow}>
                <Text style={styles.statusBadge}>{formatProvider(record.extracted.provider)}</Text>
                <Text style={styles.statusDetail}>{formatConfidence(record.extracted.confidence)}</Text>
              </View>
              <Text style={styles.helperText}>
                View the extracted report values below. These are the readings ApolloStay uses for profile updates and meal guidance.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Report overview</Text>
              <View style={styles.readingGrid}>
                <View style={styles.readingCard}>
                  <Text style={styles.readingLabel}>Record date</Text>
                  <Text style={styles.readingValue}>{record.extracted.recordDate || "Not detected"}</Text>
                </View>
                <View style={styles.readingCard}>
                  <Text style={styles.readingLabel}>Uploaded</Text>
                  <Text style={styles.readingValue}>{new Date(record.uploadedAt).toLocaleDateString()}</Text>
                </View>
              </View>
              {summary ? (
                <View style={styles.summaryBlock}>
                  <Text style={styles.readingLabel}>Summary</Text>
                  <Text style={styles.summaryText}>{summary}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Diagnoses</Text>
              {multilineToList(diagnoses).length > 0 ? (
                <View style={styles.tagWrap}>
                  {multilineToList(diagnoses).map((item) => (
                    <Text key={item} style={styles.tag}>
                      {item}
                    </Text>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>No diagnoses extracted.</Text>
              )}

              <Text style={styles.sectionTitle}>Medications</Text>
              {multilineToList(medications).length > 0 ? (
                <View style={styles.tagWrap}>
                  {multilineToList(medications).map((item) => (
                    <Text key={item} style={styles.tagMuted}>
                      {item}
                    </Text>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>No medications extracted.</Text>
              )}

              <Text style={styles.sectionTitle}>Allergies</Text>
              {multilineToList(allergies).length > 0 ? (
                <View style={styles.tagWrap}>
                  {multilineToList(allergies).map((item) => (
                    <Text key={item} style={styles.tagMuted}>
                      {item}
                    </Text>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>No allergies extracted.</Text>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Vitals</Text>
              {vitals.length > 0 ? (
                <View style={styles.readingsList}>
                  {vitals.map((item, index) => (
                    <View key={`vital-view-${index}`} style={styles.readingRow}>
                      <Text style={styles.readingName}>{item.name || "Unnamed vital"}</Text>
                      <Text style={styles.readingMeasure}>
                        {item.value || "No value"} {item.unit || ""}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>No vitals extracted.</Text>
              )}

              <Text style={styles.sectionTitle}>Lab values</Text>
              {labs.length > 0 ? (
                <View style={styles.readingsList}>
                  {labs.map((item, index) => (
                    <View key={`lab-view-${index}`} style={styles.readingRow}>
                      <Text style={styles.readingName}>{item.name || "Unnamed test"}</Text>
                      <Text style={styles.readingMeasure}>
                        {item.value || "No value"} {item.unit || ""}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>No lab values extracted.</Text>
              )}
            </View>

            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.sectionTitle}>Advanced parser review</Text>
                <Pressable onPress={() => setShowAdvancedReview((current) => !current)} style={styles.chipButton}>
                  <Text style={styles.chipButtonText}>{showAdvancedReview ? "Hide" : "Show"}</Text>
                </Pressable>
              </View>
              <Text style={styles.helperText}>
                Only open this if the readings look wrong. It exposes OCR text and manual correction tools.
              </Text>

              {showAdvancedReview ? (
                <>
                  {record.sourceTextOrigin ? (
                    <Text style={styles.originText}>Source: {record.sourceTextOrigin.replace(/_/g, " ")}</Text>
                  ) : null}

                  <TextInput
                    value={sourceText}
                    onChangeText={setSourceText}
                    placeholder="Extracted source text"
                    placeholderTextColor={palette.textSubtle}
                    multiline
                    style={[styles.input, styles.sourceTextInput]}
                  />
                  <PrimaryButton
                    label={reparsing ? "Re-running local parse..." : "Re-run local parse"}
                    onPress={handleReparseFromText}
                    disabled={reparsing || sourceText.trim().length === 0}
                  />

                  <Text style={styles.sectionTitle}>Editable summary</Text>
                  <TextInput
                    value={summary}
                    onChangeText={setSummary}
                    placeholder="Short summary of the record"
                    placeholderTextColor={palette.textSubtle}
                    multiline
                    style={[styles.input, styles.multilineInput]}
                  />
                  <TextInput
                    value={recordDate}
                    onChangeText={setRecordDate}
                    placeholder="Record date (YYYY-MM-DD)"
                    placeholderTextColor={palette.textSubtle}
                    style={styles.input}
                  />
                  <TextInput
                    value={diagnoses}
                    onChangeText={setDiagnoses}
                    placeholder="One diagnosis per line"
                    placeholderTextColor={palette.textSubtle}
                    multiline
                    style={[styles.input, styles.multilineInput]}
                  />
                  <TextInput
                    value={medications}
                    onChangeText={setMedications}
                    placeholder="One medication per line"
                    placeholderTextColor={palette.textSubtle}
                    multiline
                    style={[styles.input, styles.multilineInput]}
                  />
                  <TextInput
                    value={allergies}
                    onChangeText={setAllergies}
                    placeholder="One allergy per line"
                    placeholderTextColor={palette.textSubtle}
                    multiline
                    style={[styles.input, styles.multilineInput]}
                  />
                  <TextInput
                    value={dietaryFlags}
                    onChangeText={setDietaryFlags}
                    placeholder="One nutrition flag per line"
                    placeholderTextColor={palette.textSubtle}
                    multiline
                    style={[styles.input, styles.multilineInput]}
                  />

                  <View style={styles.row}>
                    <Text style={styles.sectionTitle}>Edit vitals</Text>
                    <Pressable onPress={() => addObservation(setVitals)} style={styles.chipButton}>
                      <Text style={styles.chipButtonText}>Add vital</Text>
                    </Pressable>
                  </View>
                  {vitals.map((item, index) => (
                    <View key={`vital-edit-${index}`} style={styles.observationCard}>
                      <TextInput
                        value={item.name}
                        onChangeText={(value) => updateObservation(setVitals, index, "name", value)}
                        placeholder="Vital name"
                        placeholderTextColor={palette.textSubtle}
                        style={styles.input}
                      />
                      <View style={styles.rowInputs}>
                        <TextInput
                          value={item.value}
                          onChangeText={(value) => updateObservation(setVitals, index, "value", value)}
                          placeholder="Value"
                          placeholderTextColor={palette.textSubtle}
                          style={[styles.input, styles.halfInput]}
                        />
                        <TextInput
                          value={item.unit}
                          onChangeText={(value) => updateObservation(setVitals, index, "unit", value)}
                          placeholder="Unit"
                          placeholderTextColor={palette.textSubtle}
                          style={[styles.input, styles.halfInput]}
                        />
                      </View>
                      <Pressable onPress={() => removeObservation(setVitals, index)} style={styles.removeButton}>
                        <Text style={styles.removeButtonText}>Remove</Text>
                      </Pressable>
                    </View>
                  ))}

                  <View style={styles.row}>
                    <Text style={styles.sectionTitle}>Edit lab values</Text>
                    <Pressable onPress={() => addObservation(setLabs)} style={styles.chipButton}>
                      <Text style={styles.chipButtonText}>Add lab</Text>
                    </Pressable>
                  </View>
                  {labs.map((item, index) => (
                    <View key={`lab-edit-${index}`} style={styles.observationCard}>
                      <TextInput
                        value={item.name}
                        onChangeText={(value) => updateObservation(setLabs, index, "name", value)}
                        placeholder="Lab name"
                        placeholderTextColor={palette.textSubtle}
                        style={styles.input}
                      />
                      <View style={styles.rowInputs}>
                        <TextInput
                          value={item.value}
                          onChangeText={(value) => updateObservation(setLabs, index, "value", value)}
                          placeholder="Value"
                          placeholderTextColor={palette.textSubtle}
                          style={[styles.input, styles.halfInput]}
                        />
                        <TextInput
                          value={item.unit}
                          onChangeText={(value) => updateObservation(setLabs, index, "unit", value)}
                          placeholder="Unit"
                          placeholderTextColor={palette.textSubtle}
                          style={[styles.input, styles.halfInput]}
                        />
                      </View>
                      <Pressable onPress={() => removeObservation(setLabs, index)} style={styles.removeButton}>
                        <Text style={styles.removeButtonText}>Remove</Text>
                      </Pressable>
                    </View>
                  ))}
                </>
              ) : null}
            </View>

            <PrimaryButton label={saving ? "Saving..." : "Save values"} onPress={handleSave} />
            {saveMessage ? <Text style={styles.successText}>{saveMessage}</Text> : null}
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <Text style={styles.backButtonText}>Back to profile</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xl * 3
  },
  headerCard: {
    backgroundColor: palette.card,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.sm
  },
  title: {
    color: palette.textPrimary,
    fontSize: typography.h2,
    fontWeight: "800"
  },
  subtitle: {
    color: palette.textPrimary,
    fontSize: typography.label,
    fontWeight: "700"
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    alignItems: "center"
  },
  statusBadge: {
    color: palette.primary,
    backgroundColor: "#DBEAFE",
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "capitalize"
  },
  statusDetail: {
    color: palette.textMuted,
    fontSize: typography.caption,
    fontWeight: "600"
  },
  helperText: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 22
  },
  originText: {
    color: palette.accent,
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4
  },
  card: {
    backgroundColor: palette.card,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md
  },
  sectionTitle: {
    color: palette.textPrimary,
    fontSize: typography.label,
    fontWeight: "700"
  },
  input: {
    backgroundColor: palette.bg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    color: palette.textPrimary,
    fontSize: typography.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  },
  multilineInput: {
    minHeight: 88,
    textAlignVertical: "top"
  },
  sourceTextInput: {
    minHeight: 180,
    textAlignVertical: "top"
  },
  readingGrid: {
    flexDirection: "row",
    gap: spacing.md
  },
  readingCard: {
    flex: 1,
    backgroundColor: palette.bg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    gap: spacing.xs
  },
  readingLabel: {
    color: palette.textSubtle,
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4
  },
  readingValue: {
    color: palette.textPrimary,
    fontSize: typography.label,
    fontWeight: "700"
  },
  summaryBlock: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.xs
  },
  summaryText: {
    color: palette.textPrimary,
    fontSize: typography.body,
    lineHeight: 22
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  tag: {
    backgroundColor: "#DBEAFE",
    color: palette.primary,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  tagMuted: {
    backgroundColor: "#F1F5F9",
    color: palette.textPrimary,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  emptyText: {
    color: palette.textMuted,
    fontSize: typography.body
  },
  readingsList: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.bg,
    overflow: "hidden"
  },
  readingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.border
  },
  readingName: {
    flex: 1,
    color: palette.textPrimary,
    fontSize: typography.body,
    fontWeight: "600"
  },
  readingMeasure: {
    color: palette.primary,
    fontSize: typography.body,
    fontWeight: "700",
    textAlign: "right"
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md
  },
  rowInputs: {
    flexDirection: "row",
    gap: spacing.sm
  },
  halfInput: {
    flex: 1
  },
  observationCard: {
    gap: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.bg,
    padding: spacing.md
  },
  chipButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  chipButtonText: {
    color: palette.accent,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  removeButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  removeButtonText: {
    color: palette.error,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  successText: {
    color: palette.success,
    fontSize: typography.body
  },
  backButton: {
    alignSelf: "center",
    paddingVertical: spacing.sm
  },
  backButtonText: {
    color: palette.textSubtle,
    fontSize: typography.body,
    fontWeight: "700"
  }
});
