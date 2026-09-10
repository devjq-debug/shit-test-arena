import Arena from "../../../components/Arena";

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <Arena initialCode={code.toUpperCase()} />;
}
