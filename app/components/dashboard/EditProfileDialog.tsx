"use client";

import React, { useCallback, useEffect, useState } from "react";
import Cropper from "react-easy-crop";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import getCroppedImg from "@/app/utils/cropImage";
import { apiRequest } from "@/lib/api";
import type { User } from "@/app/contexts/AuthContext";

interface EditProfileDialogProps {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (update: { display_name: string; bio: string | null; avatar_url: string | null }) => Promise<void>;
}

export default function EditProfileDialog({ user, open, onOpenChange, onSave }: EditProfileDialogProps) {
  const [displayName, setDisplayName] = useState(user.display_name);
  const [bio, setBio] = useState(user.bio ?? "");
  const [isUpdating, setIsUpdating] = useState(false);

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  useEffect(() => {
    if (open) {
      setDisplayName(user.display_name);
      setBio(user.bio ?? "");
      setImageSrc(null);
      setZoom(1);
    }
  }, [open, user]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setImageSrc(URL.createObjectURL(e.target.files[0]));
    }
  };

  const onCropComplete = useCallback((_: any, pixels: any) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      toast.warning("Отображаемое имя не может быть пустым.");
      return;
    }
    setIsUpdating(true);
    try {
      let newAvatarUrl: string | null = user.avatar_url;

      if (imageSrc && croppedAreaPixels) {
        const blob = await getCroppedImg(imageSrc, croppedAreaPixels);
        if (blob) {
          const formData = new FormData();
          formData.append("file", blob, "avatar.jpg");
          const uploadRes = await apiRequest("/users/me/avatar", { method: "POST", formData });
          if (uploadRes.ok) {
            const data = await uploadRes.json();
            // Persist the canonical relative path ("/uploads/avatars/...").
            // Render sites absolutize it per-host; storing an absolute URL here
            // would bake the current IP into the DB and break on other hosts.
            newAvatarUrl = data.avatar_url;
          } else {
            toast.error("Не удалось загрузить аватар.");
          }
        }
      }

      await onSave({
        display_name: displayName,
        bio: bio || null,
        avatar_url: newAvatarUrl,
      });
      toast.success("Профиль успешно обновлен!");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Не удалось обновить профиль.");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle>Редактирование профиля</DialogTitle>
          <DialogDescription>
            Загрузите новую фотографию, обрежьте ее, и измените ваши данные.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-6 py-4">
            <div className="flex flex-col gap-3">
              <Label>Фотография профиля</Label>
              {!imageSrc ? (
                <div className="flex items-center justify-center w-full">
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-border border-dashed rounded-xl cursor-pointer bg-muted/20 hover:bg-muted/40 transition-colors">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="w-8 h-8 mb-3 text-muted-foreground" />
                      <p className="mb-2 text-sm text-muted-foreground">
                        <span className="font-semibold text-foreground">Нажмите для загрузки</span> или перетащите файл
                      </p>
                      <p className="text-xs text-muted-foreground">PNG, JPG, JPEG</p>
                    </div>
                    <input type="file" className="hidden" accept="image/*" onChange={onFileChange} />
                  </label>
                </div>
              ) : (
                <div className="relative w-full h-64 bg-black rounded-xl overflow-hidden border border-border">
                  <Cropper
                    image={imageSrc}
                    crop={crop}
                    zoom={zoom}
                    aspect={1}
                    cropShape="round"
                    showGrid={false}
                    onCropChange={setCrop}
                    onCropComplete={onCropComplete}
                    onZoomChange={setZoom}
                  />
                  <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4 px-8">
                    <input
                      type="range"
                      value={zoom}
                      min={1}
                      max={3}
                      step={0.1}
                      aria-labelledby="Zoom"
                      onChange={(e) => setZoom(Number(e.target.value))}
                      className="w-full max-w-[200px]"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-8 w-8 rounded-full"
                    onClick={() => setImageSrc(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <div className="grid gap-2 text-left">
              <Label htmlFor="edit-name">Отображаемое имя</Label>
              <Input
                id="edit-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2 text-left">
              <Label htmlFor="edit-bio">Биография</Label>
              <Textarea
                id="edit-bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="resize-none"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={isUpdating}>
              {isUpdating ? "Сохранение..." : "Сохранить изменения"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
