import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import {
  getPoolQuestionService,
  getQuestionPoolService,
} from "src/lib/services-singleton";
import { CreatePoolDialog } from "./create-pool-form";

export const metadata = {
  title: "Question Bank — LMS Admin",
  description: "Manage global question pools",
};

export default async function PoolsPage() {
  const poolService = await getQuestionPoolService();
  const poolQuestionService = await getPoolQuestionService();
  const pools = await poolService.listPools();

  // Question count per pool (N+1 — acceptable, mirrors the students page).
  const counts = await Promise.all(
    pools.map((pool) =>
      poolQuestionService
        .listPoolQuestions(pool.id)
        .then((questions) => questions.length),
    ),
  );

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Question Bank</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {pools.length} pool{pools.length !== 1 ? "s" : ""}
          </p>
        </div>
        <CreatePoolDialog />
      </header>

      {pools.length > 0 ? (
        <div className="space-y-3">
          {pools.map((pool, index) => (
            <Link
              key={pool.id}
              href={`/admin/pools/${pool.id}`}
              className="block"
            >
              <Card className="transition-colors hover:bg-accent/50">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-lg">
                    <span>{pool.name}</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      {counts[index]} question
                      {counts[index] !== 1 ? "s" : ""}
                    </span>
                  </CardTitle>
                </CardHeader>
                {pool.description && (
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {pool.description}
                    </p>
                  </CardContent>
                )}
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-center text-muted-foreground">
          No pools yet. Click &quot;Add Pool&quot; to create one.
        </p>
      )}
    </div>
  );
}
