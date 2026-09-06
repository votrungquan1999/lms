import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";

/**
 * Shown when the token resolves to a course with a live invite link.
 * @param title - The title of the course the token invites the visitor to join.
 */
export function ValidInviteCard({ title }: { title: string }) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardDescription>You&apos;re invited to join</CardDescription>
        <CardTitle className="text-xl">{title}</CardTitle>
      </CardHeader>
    </Card>
  );
}

/**
 * Shown for a token that is invalid, revoked, or points at a deleted
 * course. Deliberately the same for all three (D43) — the join page must
 * never become a course-existence oracle.
 */
export function InvalidInviteCard() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-xl">Invitation no longer valid</CardTitle>
        <CardDescription>
          This join link is no longer valid. Ask whoever shared it with you for
          a new one.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
