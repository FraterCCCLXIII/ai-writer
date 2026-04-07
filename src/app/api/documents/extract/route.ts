import { NextRequest, NextResponse } from "next/server";
import WordExtractor from "word-extractor";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file." }, { status: 400 });
  }

  const ext = file.name.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
  if (ext !== "doc") {
    return NextResponse.json(
      { error: "Only legacy .doc files are handled here." },
      { status: 400 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const extractor = new WordExtractor();
  try {
    const doc = await extractor.extract(buf);
    const text = doc.getBody();
    return NextResponse.json({ text });
  } catch {
    return NextResponse.json(
      { error: "Could not read that Word document." },
      { status: 422 },
    );
  }
}
