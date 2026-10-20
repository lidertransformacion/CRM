import { NextResponse } from "next/server";
import { contractBundle, replaceContractFile, updateContract, type LinkInput, type SignerInput } from "@/lib/legal/contracts";
import { legalContext, legalError, pdfFromForm } from "@/lib/legal/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { db, actor } = await legalContext(request);
    const { id } = await params;
    return NextResponse.json(await contractBundle(db, actor, Number(id)));
  } catch (error) {
    return legalError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { db, actor } = await legalContext(request);
    const { id } = await params;
    const body = (await request.json()) as {
      title?: string;
      type?: string;
      status?: string;
      counterparty_name?: string | null;
      counterparty_nit?: string | null;
      country?: string | null;
      start_date?: string | null;
      end_date?: string | null;
      renewal_notice_days?: number | null;
      value_cop?: number | null;
      links?: LinkInput[];
      signers?: SignerInput[];
    };
    await updateContract(db, actor, Number(id), {
      title: body.title ?? "",
      type: body.type ?? "",
      status: body.status,
      counterparty_name: body.counterparty_name,
      counterparty_nit: body.counterparty_nit,
      country: body.country,
      start_date: body.start_date,
      end_date: body.end_date,
      renewal_notice_days: body.renewal_notice_days,
      value_cop: body.value_cop,
      links: body.links,
      signers: body.signers,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return legalError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { db, actor } = await legalContext(request);
    const { id } = await params;
    const form = await request.formData();
    const pdf = await pdfFromForm(form);
    const file = await replaceContractFile(db, actor, Number(id), pdf);
    return NextResponse.json({ file });
  } catch (error) {
    return legalError(error);
  }
}
