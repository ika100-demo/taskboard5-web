import { TaskBoard } from "./_components/task-board";
import { listTasks } from "./_lib/tasks/api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const result = await listTasks();
  return (
    <div className="board container">
      <h1>Task board</h1>
      <TaskBoard initial={result} />
    </div>
  );
}
