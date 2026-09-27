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
import {
  DeletePoolQuestionButton,
  PoolQuestionEditPanel,
} from "./pool-question-edit.state";

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
        <h1 className="wrap-anywhere text-3xl font-bold tracking-tight">
          {pool.name}
        </h1>
        {pool.description && (
          <p className="wrap-anywhere mt-1 text-sm text-muted-foreground">
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
                  <span className="flex items-center gap-2">
                    {question.title}
                    <Badge variant="outline">
                      {TYPE_LABELS[question.type] ?? question.type}
                    </Badge>
                  </span>
                  <DeletePoolQuestionButton
                    poolQuestionId={question.id}
                    poolId={poolId}
                  />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {question.content && (
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {question.content}
                  </p>
                )}
                <PoolQuestionEditPanel question={question} poolId={poolId} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AddPoolQuestionForm poolId={poolId} />
    </div>
  );
}
