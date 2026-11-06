"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { LOAD_ERROR, NO_DUE_DATE, NO_TASKS } from "../_lib/tasks/messages";
import type { ListResult, Task } from "../_lib/tasks/types";
import { AddTaskForm } from "./add-task-form";

export type TaskBoardProps = { initial: ListResult };

export function TaskBoard({ initial }: TaskBoardProps) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>(initial.ok ? initial.tasks : []);

  function onAdded(task: Task) {
    if (!initial.ok) {
      router.refresh();
      return;
    }
    setTasks((current) => [...current, task]);
  }

  return (
    <>
      {!initial.ok ? (
        <p role="alert" className="board-error">
          {LOAD_ERROR}
        </p>
      ) : tasks.length === 0 ? (
        <p className="board-empty">{NO_TASKS}</p>
      ) : (
        <ul aria-label="Tasks" className="task-list">
          {tasks.map((task) => (
            <li key={task.id}>
              <span className="task-title">{task.title}</span>
              <span className="task-due">{task.due_date ?? NO_DUE_DATE}</span>
            </li>
          ))}
        </ul>
      )}
      <AddTaskForm onAdded={onAdded} />
    </>
  );
}
