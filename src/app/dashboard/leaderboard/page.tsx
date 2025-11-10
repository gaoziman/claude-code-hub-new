import { LeaderboardView } from "./_components/leaderboard-view";
import { getSession } from "@/lib/auth";
import { getSystemSettings } from "@/repository/system-config";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const [session, systemSettings] = await Promise.all([getSession(), getSystemSettings()]);
  const viewer = session
    ? {
        id: session.user.id,
        role: session.user.role,
        name: session.user.name,
      }
    : null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">消耗排行榜</h1>
        <p className="text-sm text-muted-foreground">查看用户消耗排名，数据每 5 分钟更新一次</p>
      </div>
      <LeaderboardView viewer={viewer} currencyCode={systemSettings.currencyDisplay} />
    </div>
  );
}
