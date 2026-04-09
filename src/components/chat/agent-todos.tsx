"use client";

import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import type { TodoItem } from "@/lib/ai/types";

type Props = {
  todos: TodoItem[];
};

const statusIcon = (status: TodoItem["status"]) => {
  if (status === "completed")
    return <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />;
  if (status === "in_progress")
    return <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-blue-500" />;
  return <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />;
};

export function AgentTodos({ todos }: Props) {
  if (todos.length === 0) return null;

  return (
    <div className="mx-4 mb-2 mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        Agent plan
      </p>
      <ol className="flex flex-col gap-1.5">
        {todos.map((todo) => (
          <li key={todo.id} className="flex items-start gap-2">
            {statusIcon(todo.status)}
            <span
              className={[
                "text-xs leading-snug",
                todo.status === "completed"
                  ? "text-muted-foreground line-through"
                  : "text-foreground",
              ].join(" ")}
            >
              {todo.content}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
