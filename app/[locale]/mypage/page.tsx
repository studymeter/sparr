import { getTranslations, setRequestLocale } from "next-intl/server";
import MyPageSettings from "@/components/MyPageSettings";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return { title: t("userMypage") };
}

export default async function UserMyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <MyPageSettings />;
}
