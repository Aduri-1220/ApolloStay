const PptxGenJS = require("pptxgenjs");

const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "OpenAI Codex";
pptx.company = "ApolloStay";
pptx.subject = "ApolloStay app presentation";
pptx.title = "ApolloStay - AI Nutrition and Health Companion";
pptx.lang = "en-US";
pptx.theme = {
  headFontFace: "Aptos Display",
  bodyFontFace: "Aptos",
  lang: "en-US"
};

const colors = {
  primary: "1D4ED8",
  primaryDark: "1E40AF",
  bg: "F8FAFC",
  surface: "FFFFFF",
  border: "E2E8F0",
  text: "0F172A",
  muted: "475569",
  success: "15803D",
  warning: "B45309",
  error: "B91C1C",
  blueSoft: "DBEAFE",
  bluePale: "EFF6FF"
};

function addBackground(slide) {
  slide.background = { color: colors.bg };
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 7.5,
    line: { color: colors.bg },
    fill: { color: colors.bg }
  });
}

function addTitle(slide, kicker, title, subtitle) {
  slide.addText(kicker, {
    x: 0.6,
    y: 0.45,
    w: 3.5,
    h: 0.3,
    fontFace: "Aptos",
    fontSize: 14,
    bold: true,
    color: colors.primary,
    charSpace: 1.1
  });
  slide.addText(title, {
    x: 0.6,
    y: 0.85,
    w: 8.8,
    h: 0.9,
    fontFace: "Aptos Display",
    fontSize: 24,
    bold: true,
    color: colors.text
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.6,
      y: 1.65,
      w: 8.9,
      h: 0.6,
      fontFace: "Aptos",
      fontSize: 12,
      color: colors.muted,
      breakLine: false
    });
  }
}

function addBulletList(slide, items, x, y, w, h) {
  const runs = [];
  items.forEach((item) => {
    runs.push({
      text: item,
      options: {
        bullet: { indent: 12 },
        hanging: 3,
        breakLine: true
      }
    });
  });
  slide.addText(runs, {
    x,
    y,
    w,
    h,
    fontFace: "Aptos",
    fontSize: 18,
    color: colors.text,
    paraSpaceAfterPt: 10,
    valign: "top"
  });
}

function addMetricCard(slide, x, y, w, h, label, value, detail, fill = colors.surface, valueColor = colors.text) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.08,
    line: { color: colors.border, pt: 1 },
    fill: { color: fill }
  });
  slide.addText(label.toUpperCase(), {
    x: x + 0.18,
    y: y + 0.12,
    w: w - 0.25,
    h: 0.18,
    fontSize: 10,
    bold: true,
    color: colors.muted,
    charSpace: 0.8
  });
  slide.addText(value, {
    x: x + 0.18,
    y: y + 0.38,
    w: w - 0.25,
    h: 0.36,
    fontSize: 22,
    bold: true,
    color: valueColor
  });
  if (detail) {
    slide.addText(detail, {
      x: x + 0.18,
      y: y + h - 0.3,
      w: w - 0.25,
      h: 0.18,
      fontSize: 9,
      color: colors.muted
    });
  }
}

function addSectionCard(slide, title, items, x, y, w, h, accent = colors.primary) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.08,
    line: { color: colors.border, pt: 1 },
    fill: { color: colors.surface }
  });
  slide.addShape(pptx.ShapeType.rect, {
    x,
    y,
    w: 0.09,
    h,
    line: { color: accent, pt: 0 },
    fill: { color: accent }
  });
  slide.addText(title, {
    x: x + 0.22,
    y: y + 0.14,
    w: w - 0.3,
    h: 0.24,
    fontSize: 16,
    bold: true,
    color: colors.text
  });
  addBulletList(slide, items, x + 0.18, y + 0.46, w - 0.32, h - 0.55);
}

// Slide 1
{
  const slide = pptx.addSlide();
  addBackground(slide);
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.55,
    y: 0.5,
    w: 12.2,
    h: 6.45,
    rectRadius: 0.08,
    line: { color: colors.border, pt: 1 },
    fill: { color: colors.surface }
  });
  slide.addText("APOLLOSTAY", {
    x: 0.95,
    y: 0.95,
    w: 2.4,
    h: 0.3,
    fontSize: 16,
    bold: true,
    color: colors.primary,
    charSpace: 1.4
  });
  slide.addText("AI Nutrition and Health Companion", {
    x: 0.95,
    y: 1.45,
    w: 6.8,
    h: 0.7,
    fontFace: "Aptos Display",
    fontSize: 28,
    bold: true,
    color: colors.text
  });
  slide.addText("A mobile-first platform that connects food logging, medical record parsing, personalized meal planning, hydration, workouts, and weekly health insights.", {
    x: 0.95,
    y: 2.25,
    w: 6.4,
    h: 0.9,
    fontSize: 15,
    color: colors.muted,
    breakLine: false
  });
  addMetricCard(slide, 0.95, 4.05, 2.0, 1.25, "Core modules", "6", "Nutrition, plans, profile, insights, workouts, records", colors.bluePale, colors.primary);
  addMetricCard(slide, 3.15, 4.05, 2.0, 1.25, "Architecture", "Expo + Node", "Mobile frontend with local-first API backend");
  addMetricCard(slide, 5.35, 4.05, 2.0, 1.25, "Data source", "Profile + OCR", "Meal guidance grounded in parsed records");
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 8.2,
    y: 1.05,
    w: 3.8,
    h: 4.95,
    rectRadius: 0.12,
    line: { color: colors.blueSoft, pt: 1.25 },
    fill: { color: colors.bluePale }
  });
  slide.addText("Presentation agenda", {
    x: 8.55,
    y: 1.35,
    w: 2.9,
    h: 0.3,
    fontSize: 16,
    bold: true,
    color: colors.text
  });
  addBulletList(
    slide,
    [
      "Problem statement and product vision",
      "Approach and system architecture",
      "Key features and user journeys",
      "Medical-record-driven meal planning",
      "Current strengths, limitations, and roadmap"
    ],
    8.45,
    1.85,
    3.0,
    3.2
  );
}

// Slide 2
{
  const slide = pptx.addSlide();
  addBackground(slide);
  addTitle(
    slide,
    "PROBLEM",
    "Why ApolloStay was built",
    "Users often manage food, health reports, and daily habits in disconnected apps, which makes personalized action difficult."
  );
  addSectionCard(slide, "Current user pain points", [
    "Meal tracking apps rarely understand Indian foods, portion styles, or homemade meals well.",
    "Medical reports are difficult to translate into everyday food choices.",
    "Most meal plans are static and do not adapt to what the user has already eaten today.",
    "Users want one place for food logging, health context, hydration, workouts, and insights."
  ], 0.65, 2.15, 5.95, 3.95, colors.primary);
  addSectionCard(slide, "ApolloStay product goal", [
    "Convert personal health context into practical daily nutrition decisions.",
    "Use parsed medical values, profile metrics, and meal logs to guide recommendations.",
    "Offer a mobile-first, simple, and explainable experience rather than a black-box chatbot."
  ], 6.85, 2.15, 5.85, 3.95, colors.success);
}

// Slide 3
{
  const slide = pptx.addSlide();
  addBackground(slide);
  addTitle(
    slide,
    "APPROACH",
    "How ApolloStay works",
    "The app combines profile setup, local record storage, OCR-based medical extraction, and nutrition planning in one continuous flow."
  );
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.7,
    y: 2.0,
    w: 11.95,
    h: 3.75,
    rectRadius: 0.08,
    line: { color: colors.border, pt: 1 },
    fill: { color: colors.surface }
  });
  const boxes = [
    ["1. Profile setup", "Height, weight, activity, goals, diet preferences, allergies, and conditions"],
    ["2. Medical record parsing", "OCR + extraction + review screen for labs, vitals, medications, and diagnoses"],
    ["3. Daily logging", "Food search, barcode, voice, manual entry, water intake, and workout logs"],
    ["4. Action layer", "Meal plans, insights, and health summaries grounded in the saved data"]
  ];
  boxes.forEach((box, index) => {
    const x = 0.95 + index * 2.9;
    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y: 2.45,
      w: 2.4,
      h: 2.25,
      rectRadius: 0.06,
      line: { color: colors.border, pt: 1 },
      fill: { color: index % 2 === 0 ? colors.bluePale : colors.surface }
    });
    slide.addText(box[0], {
      x: x + 0.15,
      y: 2.62,
      w: 2.1,
      h: 0.35,
      fontSize: 15,
      bold: true,
      color: colors.text
    });
    slide.addText(box[1], {
      x: x + 0.15,
      y: 3.05,
      w: 2.08,
      h: 1.15,
      fontSize: 11,
      color: colors.muted
    });
    if (index < boxes.length - 1) {
      slide.addShape(pptx.ShapeType.chevron, {
        x: x + 2.47,
        y: 3.15,
        w: 0.22,
        h: 0.38,
        line: { color: colors.primary, pt: 1 },
        fill: { color: colors.primary }
      });
    }
  });
}

// Slide 4
{
  const slide = pptx.addSlide();
  addBackground(slide);
  addTitle(
    slide,
    "FEATURES",
    "Core modules in the current app",
    "ApolloStay already supports a broad, integrated health-and-nutrition workflow."
  );
  addSectionCard(slide, "Nutrition", [
    "Food search with USDA, Indian foods, custom foods, barcode lookup, voice logging, and manual entry.",
    "Water logging with quick-add actions and target tracking.",
    "Meal suggestions based on profile and medical context."
  ], 0.65, 2.05, 4.0, 4.4, "F97316");
  addSectionCard(slide, "Medical records", [
    "PDF/image upload, OCR, extracted readings review, and record deletion.",
    "Profile updates prefer newer report readings over older values.",
    "Safer parser flow to reduce header, address, and boilerplate noise."
  ], 4.82, 2.05, 4.0, 4.4, colors.primary);
  addSectionCard(slide, "Plans, insights, workouts", [
    "Daily meal plans with profile-based diet style and swap options.",
    "Insights dashboard with weekly macro charts and health metric cards.",
    "Workout tab with exercise browsing, quick logs, and history."
  ], 8.98, 2.05, 3.7, 4.4, colors.success);
}

// Slide 5
{
  const slide = pptx.addSlide();
  addBackground(slide);
  addTitle(
    slide,
    "MEDICAL-AWARE NUTRITION",
    "How recommendations are personalized",
    "Meal suggestions are not generic templates; they are shaped by extracted report values and user profile settings."
  );
  addSectionCard(slide, "Inputs used for planning", [
    "Saved profile: height, weight, activity level, goals, diet preferences, allergies, conditions",
    "Parsed medical values: HbA1c, glucose, hemoglobin, thyroid values, blood pressure, and more",
    "Daily food logs: what has already been eaten today",
    "Time context: remaining meals and remaining calorie target"
  ], 0.7, 2.05, 5.8, 4.3, colors.primary);
  addSectionCard(slide, "Planning logic", [
    "If breakfast or lunch is already logged, the planner shifts to the remaining meals only.",
    "The app tries to meet the remaining calorie target rather than repeating a full-day plan.",
    "Diet style can change by day: profile, veg, egg, or non-veg.",
    "Meals now support swap options so the user can choose among alternatives."
  ], 6.75, 2.05, 5.9, 4.3, colors.warning);
}

// Slide 6
{
  const slide = pptx.addSlide();
  addBackground(slide);
  addTitle(
    slide,
    "TECHNICAL ARCHITECTURE",
    "Current implementation model",
    "ApolloStay follows a local-first mobile plus Node backend approach that is practical for rapid iteration."
  );
  addSectionCard(slide, "Frontend", [
    "Expo + React Native app with tab-based navigation",
    "Nutrition, plans, workouts, insights, profile, and medical review screens",
    "Clinical blue design system for a cleaner healthcare feel"
  ], 0.7, 2.05, 3.9, 4.3, colors.primary);
  addSectionCard(slide, "Backend", [
    "Node.js API server centered on a local route layer",
    "File-based JSON persistence for profiles, meal logs, records, plans, hydration, and workouts",
    "OCR/parser pipeline with medical value extraction and review loop"
  ], 4.72, 2.05, 3.9, 4.3, colors.success);
  addSectionCard(slide, "External helpers", [
    "Open Food Facts for barcode products",
    "Optional voice transcription and meal-image analysis paths",
    "HealthKit/Health Connect deferred until native-capable distribution"
  ], 8.74, 2.05, 3.9, 4.3, colors.warning);
}

// Slide 7
{
  const slide = pptx.addSlide();
  addBackground(slide);
  addTitle(
    slide,
    "USER JOURNEY",
    "End-to-end value for the user",
    "A practical sequence from onboarding to health-aware food decisions."
  );
  addBulletList(slide, [
    "Create account and complete health profile setup",
    "Upload medical reports and review extracted readings",
    "Log meals using search, barcode, voice, or manual entry",
    "View hydration, workouts, and weekly insights",
    "Generate daily meal plans from profile + parsed records + today’s logs",
    "Swap meals or add planned meals directly to the food log"
  ], 0.8, 2.05, 5.5, 3.8);
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 7.0,
    y: 2.0,
    w: 5.3,
    h: 3.9,
    rectRadius: 0.08,
    line: { color: colors.border, pt: 1 },
    fill: { color: colors.bluePale }
  });
  slide.addText("Key user outcomes", {
    x: 7.3,
    y: 2.35,
    w: 2.3,
    h: 0.3,
    fontSize: 16,
    bold: true,
    color: colors.text
  });
  addBulletList(slide, [
    "Less guesswork around what to eat",
    "Health reports translated into day-to-day meals",
    "One place for logging, planning, and reviewing progress",
    "Clearer motivation through visible trends and streaks"
  ], 7.15, 2.8, 4.6, 2.2);
}

// Slide 8
{
  const slide = pptx.addSlide();
  addBackground(slide);
  addTitle(
    slide,
    "DIFFERENTIATORS",
    "Why ApolloStay stands out",
    "The product is strongest where standard calorie counters and generic meal planners are weakest."
  );
  addMetricCard(slide, 0.75, 2.1, 2.4, 1.3, "Health context", "Medical-aware", "Uses parsed report values", colors.bluePale, colors.primary);
  addMetricCard(slide, 3.35, 2.1, 2.4, 1.3, "Logging modes", "4+", "Search, barcode, voice, manual", colors.surface, colors.text);
  addMetricCard(slide, 5.95, 2.1, 2.4, 1.3, "Meal planning", "Adaptive", "By day, time, and remaining meals", colors.bluePale, colors.primary);
  addMetricCard(slide, 8.55, 2.1, 2.4, 1.3, "Food fit", "Indian-friendly", "Better portion and meal realism", colors.surface, colors.text);
  addSectionCard(slide, "Competitive strengths", [
    "Bridges medical records and meal guidance in one app.",
    "Supports Indian foods and practical homemade logging better than generic global-only datasets.",
    "Gives users control through swap options and multiple logging methods."
  ], 0.75, 3.8, 5.6, 2.25, colors.primary);
  addSectionCard(slide, "Current constraints", [
    "Meal variety still depends on a limited curated local pool.",
    "Some scanned reports still need better OCR/parser handling.",
    "Native health app sync is postponed until platform signing/runtime is ready."
  ], 6.55, 3.8, 5.95, 2.25, colors.warning);
}

// Slide 9
{
  const slide = pptx.addSlide();
  addBackground(slide);
  addTitle(
    slide,
    "ROADMAP",
    "Recommended next steps",
    "A practical sequence to increase product quality without overcomplicating the architecture."
  );
  addSectionCard(slide, "Near term", [
    "Expand the local curated meal database for better daily variety.",
    "Improve OCR/parser quality for more hospital/lab formats.",
    "Tighten plan generation so saved plans and day-level choices always refresh cleanly."
  ], 0.75, 2.05, 4.0, 4.25, colors.primary);
  addSectionCard(slide, "Mid term", [
    "Add scan-plate meal estimation into the Nutrition flow.",
    "Improve explainability by showing which lab values influenced each meal plan.",
    "Polish plan-to-food-log conversion and remaining-calorie logic further."
  ], 4.9, 2.05, 4.0, 4.25, colors.success);
  addSectionCard(slide, "Long term", [
    "Re-enable platform health integrations in production builds.",
    "Add friend comparison, family health dashboards, and deeper trend analytics.",
    "Transition selective features from file-based storage to a more scalable data layer if needed."
  ], 9.05, 2.05, 3.6, 4.25, colors.warning);
}

// Slide 10
{
  const slide = pptx.addSlide();
  addBackground(slide);
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.8,
    y: 1.0,
    w: 11.7,
    h: 5.4,
    rectRadius: 0.1,
    line: { color: colors.blueSoft, pt: 1.2 },
    fill: { color: colors.surface }
  });
  slide.addText("Thank you", {
    x: 1.2,
    y: 1.75,
    w: 3.5,
    h: 0.6,
    fontFace: "Aptos Display",
    fontSize: 26,
    bold: true,
    color: colors.text
  });
  slide.addText("ApolloStay demonstrates a practical path toward medical-aware nutrition planning on mobile by combining structured health context, flexible logging, and user-friendly daily guidance.", {
    x: 1.2,
    y: 2.55,
    w: 8.8,
    h: 1.1,
    fontSize: 18,
    color: colors.muted
  });
  slide.addText("Demo focus:", {
    x: 1.2,
    y: 4.05,
    w: 1.6,
    h: 0.25,
    fontSize: 16,
    bold: true,
    color: colors.primary
  });
  addBulletList(slide, [
    "Profile setup and BMI/calorie target",
    "Medical report upload and extracted readings",
    "Nutrition logging and adaptive meal planning",
    "Insights and workout tracking"
  ], 1.15, 4.35, 4.3, 1.4);
}

const outputPath = "/tmp/ApolloStay_Presentation.pptx";

pptx.writeFile({ fileName: outputPath }).then(() => {
  console.log(outputPath);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
