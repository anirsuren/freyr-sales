// The search page itself is a client component, so it cannot export metadata.
// This layout exists only to give the tab a name.
export const metadata = { title: "Search" };

export default function SearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
