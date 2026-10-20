import { NextResponse } from "next/server";
import { createContract, listContracts, type LinkInput, type SignerInput } from "@/lib/legal/contracts";
import { formJson, formText, legalContext, legalError, pdfFromForm } from "@/lib/legal/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { db, actor } = await legalContext(request);
    const q = new URL(request.url).searchParams.get("q") ?? "";
    return NextResponse.json({ contracts: await listContracts(db, actor, q) });
  } catch (error) {
    return legalError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { db, actor } = await legalContext(request);
    const form = await request.formData();
    const pdf = await pdfFromForm(form);
    const notice = formText(form, "renewal_notice_days");
    const value = formText(form, "value_cop");
    const id = await createContract(db, actor, {
      title: formText(form, "title"),
      type: formText(form, "type"),
      status: formText(form, "status") || undefined,
      counterparty_name: formText(form, "counterparty_name"),
      counterparty_nit: formText(form, "counterparty_nit"),
      country: formText(form, "country") || "CO",
      start_date: formText(form, "start_date"),
      end_date: formText(form, "end_date"),
      renewal_notice_days: notice.trim() ? Number(notice) : null,
      value_cop: value.trim() ? Number(value) : null,
      fileName: formText(form, "name") || pdf.name,
      mime: pdf.mime,
      bytes: pdf.bytes,
      links: formJson<LinkInput[]>(form, "links", []),
      signers: formJson<SignerInput[]>(form, "signers", []),
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return legalError(error);
  }
}
