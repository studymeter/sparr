import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import SignIn from "@/components/SignIn";
import { isGoogleSignInEnabled } from "@/lib/auth/google-sign-in";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return { title: t("signIn") };
}

export const dynamic = "force-dynamic";

export default async function SignInPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "common" });

  return (
    <Suspense fallback={<p className="auth-empty">{t("loading")}</p>}>
      <SignIn googleEnabled={isGoogleSignInEnabled()} />
    </Suspense>
  );
}
