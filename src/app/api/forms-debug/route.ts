// One-off diagnostic to list every Kit form visible to KIT_API_KEY.
// Hit it once to confirm the right form ID, then delete this file.

const KIT_FORMS_ENDPOINT = "https://api.kit.com/v4/forms";

export async function GET() {
  const apiKey = process.env.KIT_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "KIT_API_KEY is not set" },
      { status: 500 },
    );
  }

  const kitResponse = await fetch(KIT_FORMS_ENDPOINT, {
    method: "GET",
    headers: {
      "X-Kit-Api-Key": apiKey,
      Accept: "application/json",
    },
  });

  const responseText = await kitResponse.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    return Response.json(
      {
        status: kitResponse.status,
        error: "Kit did not return JSON",
        body: responseText,
      },
      { status: 502 },
    );
  }

  if (!kitResponse.ok) {
    return Response.json(
      { status: kitResponse.status, body: parsed },
      { status: kitResponse.status },
    );
  }

  const rawForms = (parsed as { forms?: unknown }).forms;
  if (!Array.isArray(rawForms)) {
    return Response.json(
      { note: "Unexpected payload shape — returning raw response", body: parsed },
      { status: 200 },
    );
  }

  const forms = rawForms.map((f) => {
    const obj = f as Record<string, unknown>;
    return { id: obj.id, name: obj.name };
  });

  return Response.json({ forms });
}
