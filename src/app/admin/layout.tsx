export const metadata = {
  title: "Admin — LMS",
};

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="admin-layout">{children}</div>;
}
