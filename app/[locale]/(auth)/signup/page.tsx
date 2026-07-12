import { getTranslations, setRequestLocale } from "next-intl/server";
import SignUp from "@/components/SignUp";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return { title: t("signUp") };
}

export default async function SignUpPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <SignUp />;
}
