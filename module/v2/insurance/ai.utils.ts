import { OpenAI } from "openai";

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

type PatientParseResult = {
  number: string | null;
  vorname: string | null;
  nachname: string | null;
};

type InsuranceOrderLite = {
  id: string;
  orderNumber: number | null;
  insuranceType: "insole" | "shoe";
  customer: {
    id: string;
    vorname: string | null;
    nachname: string | null;
    telefon: string | null;
  } | null;
  prescription: {
    insurance_provider: string | null;
    insurance_number: string | null;
  } | null;
  grossAmount: number | null;
  vatAmount: number | null;
};

type InsuranceRowLite = {
  Versicherter: string | null;
  Meldung: string | null;
  Betrag: number | null;
  "MwSt 20%": number | null;
};

type InsuranceDecision =
  | { kind: "none"; reason: string }
  | { kind: "insole"; confidence: number }
  | { kind: "shoe"; confidence: number }
  | { kind: "both"; confidenceInsole: number; confidenceShoe: number };

export async function parsePatientCellWithAi(
  raw: string,
): Promise<PatientParseResult> {
  const prompt = `
You get ONE Excel cell from a German insurance spreadsheet.
The column is called "Patient" and the value often looks like:

  "3344556677 Mustermann, Max"

The database schema has a "customers" table with these relevant fields:
- "number": optional phone or insurance number (we only detect it, we do NOT include it in the names)
- "vorname": customer's first name
- "nachname": customer's last name

Very important parsing rules:
- If the text starts with digits followed by a space, those leading digits are the "number".
- After removing the leading number and one space, the remaining text is usually "Nachname, Vorname".
- Remove the number and any extra spaces completely from the name fields.
- If there is no leading number, then "number" must be null.
- If you cannot clearly find a first name or last name, return null for that name.
- Do NOT include the number again inside "vorname" or "nachname".
- Keep the original name spelling (do not translate or change it).

Output format (STRICT JSON, no comments, no extra text):
{
  "number": "3344556677",
  "vorname": "Max",
  "nachname": "Mustermann"
}

Now parse THIS exact cell value:

"${raw}"
`;

  const response = await client.responses.create({
    model: "llama-3.3-70b-versatile", // or whichever model you prefer
    input: prompt,
  });

  // The SDK types use a union for output items; use a narrow `any` view here.
  const anyResponse = response as any;
  const text =
    anyResponse.output?.[0]?.content?.[0]?.text?.trim?.() ?? "";

  try {
    const parsed = JSON.parse(text) as PatientParseResult;
    return {
      number: parsed.number ?? null,
      vorname: parsed.vorname ?? null,
      nachname: parsed.nachname ?? null,
    };
  } catch {
    // Fallback: simple regex split if AI output is not valid JSON
    const match = raw.match(/^(\d+)\s*(.*)$/);
    const number = match ? match[1] : null;
    const rest = match ? match[2] : raw;
    const parts = rest.split(",").map((s) => s.trim());
    const nachname = parts[0] || null;
    const vorname = parts[1] || null;
    return { number, vorname, nachname };
  }
}

function normalizeName(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Simple heuristic matcher between one Excel row and at most two candidate orders.
 * No external AI call here – just deterministic scoring.
 */
export async function decideInsuranceMatchWithAi(args: {
  row: InsuranceRowLite;
  insole: InsuranceOrderLite | null;
  shoe: InsuranceOrderLite | null;
}): Promise<InsuranceDecision> {
  const { row, insole, shoe } = args;

  // If there is no candidate order at all
  if (!insole && !shoe) {
    return { kind: "none", reason: "NO_ORDERS_AVAILABLE" };
  }

  const tol = 0.02;
  const numEq = (a: number | null, b: number | null) =>
    a != null && b != null && Math.abs(a - b) <= tol;

  const excelAmount = row.Betrag ?? null;
  const excelVat = row["MwSt 20%"] ?? null;
  const excelMeldung = normalizeName(row.Meldung);
  const excelPatient = normalizeName(row.Versicherter);

  const scoreOrder = (order: InsuranceOrderLite | null): number => {
    if (!order) return 0;
    let score = 0;

    // 1) Amount match
    if (excelAmount != null && order.grossAmount != null) {
      if (numEq(excelAmount, order.grossAmount)) score += 0.5;
    }

    // 2) VAT match
    if (excelVat != null && order.vatAmount != null) {
      if (numEq(excelVat, order.vatAmount)) score += 0.2;
    }

    // 3) Insurance provider vs Meldung
    const provider = normalizeName(order.prescription?.insurance_provider);
    if (excelMeldung && provider) {
      if (
        provider.includes(excelMeldung) ||
        excelMeldung.includes(provider)
      ) {
        score += 0.2;
      }
    }

    // 4) Patient name vs customer
    const dbFullName = normalizeName(
      [order.customer?.nachname, order.customer?.vorname].filter(Boolean).join(" "),
    );
    if (excelPatient && dbFullName) {
      if (
        dbFullName.includes(excelPatient) ||
        excelPatient.includes(dbFullName)
      ) {
        score += 0.1;
      }
    }

    return score;
  };

  const insoleScore = scoreOrder(insole);
  const shoeScore = scoreOrder(shoe);

  // No good score at all
  if (insoleScore === 0 && shoeScore === 0) {
    return { kind: "none", reason: "NO_CONFIDENT_MATCH" };
  }

  // Only one side present or clearly higher score
  if (insoleScore > 0 && shoeScore === 0) {
    return { kind: "insole", confidence: insoleScore };
  }
  if (shoeScore > 0 && insoleScore === 0) {
    return { kind: "shoe", confidence: shoeScore };
  }

  // Both have some score – decide if one dominates or we keep both
  const diff = Math.abs(insoleScore - shoeScore);
  if (diff < 0.15) {
    return {
      kind: "both",
      confidenceInsole: insoleScore,
      confidenceShoe: shoeScore,
    };
  }

  return insoleScore > shoeScore
    ? { kind: "insole", confidence: insoleScore }
    : { kind: "shoe", confidence: shoeScore };
}