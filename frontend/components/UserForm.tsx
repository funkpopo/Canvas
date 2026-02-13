"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User, UserCreateData, UserUpdateData } from "@/lib/api";
import { useTranslations } from "@/hooks/use-translations";

interface UserFormProps {
  user?: User;
  onSubmit: (data: UserCreateData | UserUpdateData) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

interface UserFormValues {
  username: string;
  email: string;
  role: "admin" | "user" | "viewer";
  password: string;
  confirmPassword: string;
}

export default function UserForm({ user, onSubmit, onCancel, isLoading }: UserFormProps) {
  const t = useTranslations("userForm");
  const tCommon = useTranslations("common");
  const isEdit = !!user;
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<UserFormValues>({
    defaultValues: {
      username: user?.username || "",
      email: user?.email || "",
      role: (user?.role as UserFormValues["role"]) || "user",
      password: "",
      confirmPassword: "",
    },
  });

  const role = watch("role");

  useEffect(() => {
    if (user) {
      setValue("username", user.username);
      setValue("email", user.email || "");
      setValue("role", user.role as UserFormValues["role"]);
    }
  }, [user, setValue]);

  const onFormSubmit = (data: UserFormValues) => {
    if (!isEdit) {
      // 创建模式
      if (data.password !== data.confirmPassword) {
        toast.error(t("passwordMismatch"));
        return;
      }
      const createData: UserCreateData = {
        username: data.username,
        email: data.email || undefined,
        password: data.password,
        role: data.role,
      };
      onSubmit(createData);
    } else {
      // 编辑模式
      const updateData: UserUpdateData = {
        email: data.email || undefined,
        role: data.role,
      };
      if (data.password) {
        if (data.password !== data.confirmPassword) {
          toast.error(t("passwordMismatch"));
          return;
        }
        updateData.password = data.password;
      }
      onSubmit(updateData);
    }
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
      {/* 用户名 */}
      <div className="space-y-2">
        <Label htmlFor="username">{t("usernameLabel")}</Label>
        <Input
          id="username"
          {...register("username", { required: t("usernameRequired") })}
          disabled={isEdit || isLoading}
          placeholder={t("usernamePlaceholder")}
        />
        {errors.username && <p className="text-sm text-red-500">{errors.username.message}</p>}
      </div>

      {/* 邮箱 */}
      <div className="space-y-2">
        <Label htmlFor="email">{t("emailLabel")}</Label>
        <Input
          id="email"
          type="email"
          {...register("email")}
          disabled={isLoading}
          placeholder={t("emailPlaceholder")}
        />
      </div>

      {/* 角色 */}
      <div className="space-y-2">
        <Label htmlFor="role">{t("roleLabel")}</Label>
        <Select
          value={role}
          onValueChange={(value) => setValue("role", value as UserFormValues["role"])}
          disabled={isLoading}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("rolePlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">{t("roleAdmin")}</SelectItem>
            <SelectItem value="user">{t("roleUser")}</SelectItem>
            <SelectItem value="viewer">{t("roleViewer")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 密码 */}
      <div className="space-y-2">
        <Label htmlFor="password">{isEdit ? t("newPasswordLabel") : t("passwordLabel")}</Label>
        <Input
          id="password"
          type="password"
          {...register("password", {
            required: !isEdit ? t("passwordRequired") : false,
            minLength: { value: 6, message: t("passwordMinLength") },
          })}
          disabled={isLoading}
          placeholder={isEdit ? t("newPasswordPlaceholder") : t("passwordPlaceholder")}
        />
        {errors.password && <p className="text-sm text-red-500">{errors.password.message}</p>}
      </div>

      {/* 确认密码 */}
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">
          {isEdit ? t("confirmNewPasswordLabel") : t("confirmPasswordLabel")}
        </Label>
        <Input
          id="confirmPassword"
          type="password"
          {...register("confirmPassword", {
            validate: (value) => {
              if (watch("password") && !value) {
                return t("confirmPasswordRequired");
              }
              return true;
            },
          })}
          disabled={isLoading}
          placeholder={
            isEdit ? t("confirmNewPasswordPlaceholder") : t("confirmPasswordPlaceholder")
          }
        />
        {errors.confirmPassword && (
          <p className="text-sm text-red-500">{errors.confirmPassword.message}</p>
        )}
      </div>

      {/* 按钮 */}
      <div className="flex justify-end space-x-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? t("submitting") : isEdit ? t("update") : t("create")}
        </Button>
      </div>
    </form>
  );
}
