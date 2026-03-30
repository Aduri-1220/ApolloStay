const OLLAMA_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";

async function ollamaStructuredJson({ model, prompt }) {
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      format: "json"
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed: ${await response.text()}`);
  }

  const payload = await response.json();
  return JSON.parse(payload.response);
}

async function parseMedicalTextWithOllama(text) {
  return ollamaStructuredJson({
    model: process.env.OLLAMA_MEDICAL_MODEL || "llama3.1:8b",
    prompt: [
      "Extract nutrition-relevant medical data from this record.",
      "Return strict JSON with keys: summary, recordDate, diagnoses, medications, allergies, dietaryFlags, labResults, vitals.",
      "Do not invent missing values. Use empty arrays or null when unavailable.",
      text
    ].join("\n\n")
  });
}

async function chooseMealsWithOllama({ profile, medicalRecords, userPrompt, candidates }) {
  return ollamaStructuredJson({
    model: process.env.OLLAMA_RECOMMENDER_MODEL || "llama3.1:8b",
    prompt: [
      "Choose meal recommendations only from the provided candidates.",
      "Use the user's profile and medical records.",
      "Return strict JSON with keys: summary, recommendations.",
      "Each recommendation must have: foodId, title, whyItFits, servingSuggestion, cautions.",
      JSON.stringify({ profile, medicalRecords, userPrompt, candidates })
    ].join("\n\n")
  });
}

module.exports = {
  parseMedicalTextWithOllama,
  chooseMealsWithOllama
};
