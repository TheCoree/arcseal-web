"use client";

import React from "react";
import { Flag } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

// "Give up" with a confirmation step — one mis-click shouldn't end a match.
export function SurrenderButton({
  onConfirm,
  className,
}: {
  onConfirm: () => void;
  className?: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 px-3 h-8 text-xs font-bold border border-zinc-700 bg-zinc-900/80 text-zinc-300",
            "hover:border-rose-600/70 hover:text-rose-200 hover:bg-rose-950/40 transition-colors",
            className,
          )}
        >
          <Flag className="h-3.5 w-3.5" />
          Сдаться
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent className="z-[300]">
        <AlertDialogHeader>
          <AlertDialogTitle>Сдаться?</AlertDialogTitle>
          <AlertDialogDescription>
            Матч сразу закончится вашим поражением, рейтинг снизится как за обычный проигрыш.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Играть дальше</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Сдаться
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
