// Sparr wordmark image, used wherever the brand appears in a header.
export default function BrandLogo({
  className = "brand-logo",
}: {
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className} src="/logo.png" alt="Sparr" />
  );
}
