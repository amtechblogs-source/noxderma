import { NextResponse } from "next/server";
import ImageKit from "imagekit";

export const dynamic = "force-dynamic";

export async function GET() {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  const publicKey = process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY;
  const urlEndpoint = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT;

  if (!privateKey || !publicKey || !urlEndpoint) {
    // If external ImageKit keys are not yet configured in .env.local,
    // return an explicit setup required response with fallback demo tokens
    return NextResponse.json(
      {
        token: `mock_token_${Date.now()}`,
        expire: Math.floor(Date.now() / 1000) + 1800,
        signature: `mock_sig_${Date.now()}`,
        warning: "IMAGEKIT_PRIVATE_KEY not configured. Add credentials to .env.local.",
      },
      { status: 200 }
    );
  }

  try {
    const imagekit = new ImageKit({
      publicKey,
      privateKey,
      urlEndpoint,
    });

    const authParams = imagekit.getAuthenticationParameters();
    return NextResponse.json(authParams);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error generating ImageKit auth parameters";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get("fileId");

  if (!fileId) {
    return NextResponse.json({ error: "Missing fileId parameter" }, { status: 400 });
  }

  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  const publicKey = process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY;
  const urlEndpoint = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT;

  if (!privateKey || !publicKey || !urlEndpoint) {
    return NextResponse.json(
      { success: true, message: "Mock deletion (ImageKit credentials not configured)" },
      { status: 200 }
    );
  }

  try {
    const imagekit = new ImageKit({ publicKey, privateKey, urlEndpoint });
    await imagekit.deleteFile(fileId);
    return NextResponse.json({ success: true, fileId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error deleting ImageKit file";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
