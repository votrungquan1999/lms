import { notFound } from "next/navigation";
import { StudentQuestionCard } from "src/components/student-question-card.ui";
import { Badge } from "src/components/ui/badge";
import { QUESTION_TYPE_LABELS } from "src/lib/question-labels";
import { attachQuestionMediaUrls } from "src/lib/question-media-urls";
import {
  getPageGuard,
  getPoolQuestionService,
  getQuestionPoolService,
} from "src/lib/services-singleton";
import { AddPoolQuestionForm } from "./add-pool-question-form";
import {
  DeletePoolQuestionButton,
  PoolQuestionEditPanel,
} from "./pool-question-edit.state";
import { PoolQuestionKey } from "./pool-question-key.ui";

// Presigned media URLs are short-lived, so render dynamically to mint fresh ones.
export const dynamic = "force-dynamic";

export default async function PoolDetailPage({
  params,
}: {
  params: Promise<{ poolId: string }>;
}) {
  const guard = await getPageGuard();
  const session = await guard.requireSchoolAdmin();
  const { poolId } = await params;
  const poolService = await getQuestionPoolService(session.school.id);
  const pool = await poolService.getPool(poolId);

  if (!pool) {
    notFound();
  }

  const poolQuestionService = await getPoolQuestionService(session.school.id);
  const questions = await attachQuestionMediaUrls(
    await poolQuestionService.listPoolQuestions(poolId),
  );

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
            <StudentQuestionCard
              key={question.id}
              question={question}
              headerActions={
                <>
                  <Badge variant="secondary">
                    {QUESTION_TYPE_LABELS[question.type]}
                  </Badge>
                  <DeletePoolQuestionButton
                    poolQuestionId={question.id}
                    poolId={poolId}
                  />
                </>
              }
            >
              <PoolQuestionKey question={question} />
              <PoolQuestionEditPanel question={question} poolId={poolId} />
            </StudentQuestionCard>
          ))}
        </div>
      )}

      <AddPoolQuestionForm poolId={poolId} />
    </div>
  );
}
