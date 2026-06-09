"use client";

import { useState } from "react";
import { Button } from "src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "src/components/ui/dialog";
import { BulkImportProvider } from "./bulk-import-dialog.state";
import type { CourseOption } from "./bulk-import-dialog.type";
import { BulkImportBody } from "./bulk-import-dialog.ui";

/**
 * Entry point for bulk student import. A dialog walking the teacher through
 * upload → preview → optional course enrollment → confirm → per-student report.
 * Remounts the provider on each open so state resets between sessions.
 * @param courses - Courses available for the optional enrollment picker.
 */
export function BulkImportDialog({
  courses,
}: {
  courses: CourseOption[];
}): React.ReactNode {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Import from File</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Students from File</DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file to create many students at once.
          </DialogDescription>
        </DialogHeader>

        {open && (
          <BulkImportProvider courses={courses}>
            <BulkImportBody />
          </BulkImportProvider>
        )}
      </DialogContent>
    </Dialog>
  );
}
