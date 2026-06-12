import { notFound } from "next/navigation";
import { Badge } from "src/components/ui/badge";
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
import { AddPoolQuestionForm } from "./add-pool-question-form";

const TYPE_LABELS: Record<string, string> = {
  free_text: "Free Text",
  single_select: "Single Select",
  multi_select: "Multi Select",
};

export default async function PoolDetailPage({
  params,
}: {
  params: Promise<{ poolId: string }>;
}) {
  const { poolId } = await params;
  const poolService = await getQuestionPoolService();
  const pool = await poolService.getPool(poolId);

  if (!pool) {
    notFound();
  }

  const poolQuestionService = await getPoolQuestionService();
  const questions = await poolQuestionService.listPoolQuestions(poolId);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">{pool.name}</h1>
        {pool.description && (
          <p className="mt-1 text-sm text-muted-foreground">
            {pool.description}
          </p>
        )}
        <p className="mt-1 text-sm text-muted-foreground">
          {questions.length} question{questions.length !== 1 ? "s" : ""}
        </p>
      </header>

      {questions.length > 0 && (
        <div className="space-y-3">
          {questions.map((question) => (
            <Card key={question.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{question.title}</span>
                  <Badge variant="outline">
                    {TYPE_LABELS[question.type] ?? question.type}
                  </Badge>
                </CardTitle>
              </CardHeader>
              {question.content && (
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {question.content}
                  </p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      <AddPoolQuestionForm poolId={poolId} />
    </div>
  );
}
