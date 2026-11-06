"use client";

import { useState, useTransition } from "react";
import type { FormEvent } from "react";

import { addTask } from "../_lib/tasks/actions";
import { SAVE_ERROR } from "../_lib/tasks/messages";
import type { Task } from "../_lib/tasks/types";
import { validateTitle } from "../_lib/tasks/validation";

export type AddTaskFormProps = { onAdded: (task: Task) => void };

export function AddTaskForm({ onAdded }: AddTaskFormProps) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTitleError(null);
    setSaveError(false);
    const invalid = validateTitle(title);
    if (invalid) {
      setTitleError(invalid);
      return;
    }
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof addTask>> | null = null;
      try {
        result = await addTask({ title, due_date: dueDate === "" ? null : dueDate });
      } catch {
        result = null;
      }
      if (result && result.ok) {
        setTitle("");
        setDueDate("");
        onAdded(result.task);
      } else if (result && "titleError" in result) {
        setTitleError(result.titleError);
      } else {
        setSaveError(true);
      }
    });
  }

  return (
    <form aria-label="Add task" className="task-form" onSubmit={onSubmit} noValidate>
      <div className="field">
        <label htmlFor="title">Title</label>
        <input
          id="title"
          type="text"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-invalid={titleError ? "true" : undefined}
          aria-describedby={titleError ? "title-error" : undefined}
        />
        {titleError ? (
          <p id="title-error" className="field-error">
            {titleError}
          </p>
        ) : null}
      </div>
      <div className="field">
        <label htmlFor="due_date">Due date</label>
        <input id="due_date" type="date" name="due_date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        Add task
      </button>
      {saveError ? (
        <p role="alert" className="field-error">
          {SAVE_ERROR}
        </p>
      ) : null}
    </form>
  );
}
