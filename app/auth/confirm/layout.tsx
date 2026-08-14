// Client page, so the title has to live on a layout. A new teammate lands here
// straight from their email; the tab should say what is happening.
export const metadata = { title: "Confirming your account" };

export default function ConfirmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
