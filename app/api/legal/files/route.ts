import { NextResponse } from "next/server";
import { uploadDriveFile } from "@/lib/legal/drive";
import { formText, legalContext, legalError, optionalId, pdfFromForm } from "@/lib/legal/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { db, actor } = await legalContext(request);
    const form = await request.formData();
    const pdf = await pdfFromForm(form);
    const file = await uploadDriveFile(db, actor, {
      ...pdf,
      name: formText(form, "name") || pdf.name,
      folderId: optionalId(form.get("folder_id")),
    });
    return NextResponse.json({ file }, { status: 201 });
  } catch (error) {
    return legalError(error);
  }
}
