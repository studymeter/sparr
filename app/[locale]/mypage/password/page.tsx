import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { canChangePassword } from "@/lib/auth/sign-in-method";
import { providers } from "@/lib/composition";
import PasswordChange from "@/components/PasswordChange";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return { title: t("passwordChange") };
}

export default async function PasswordChangePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const principal = await providers.auth.getPrincipal();
  if (principal.role === "anonymous") {
    redirect({ href: "/signin", locale });
  }
  const store = await providers.getStore();
  if (!(await canChangePassword(store, principal.id))) {
    redirect({ href: "/mypage", locale });
  }

  return <PasswordChange />;
}
