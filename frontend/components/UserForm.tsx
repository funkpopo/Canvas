"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User, UserCreateData, UserUpdateData } from "@/lib/api";

interface UserFormProps {
  user?: User;
  onSubmit: (data: UserCreateData | UserUpdateData) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function UserForm({ user, onSubmit, onCancel, isLoading }: UserFormProps) {
  const isEdit = !!user;
  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm({
    defaultValues: {
      username: user?.username || "",
      email: user?.email || "",
      role: user?.role || "user",
      password: "",
      confirmPassword: "",
    },
  });

  const role = watch("role");

  useEffect(() => {
    if (user) {
      setValue("username", user.username);
      setValue("email", user.email || "");
      setValue("role", user.role);
    }
  }, [user, setValue]);

  const onFormSubmit = (data: any) => {
    if (!isEdit) {
      // 创建模式
      if (data.password !== data.confirmPassword) {
        alert("两次输入的密码不一致");
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
          alert("两次输入的密码不一致");
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
        <Label htmlFor="username">用户名 *</Label>
        <Input
          id="username"
          {...register("username", { required: "用户名不能为空" })}
          disabled={isEdit || isLoading}
          placeholder="请输入用户名"
        />
        {errors.username && (
          <p className="text-sm text-red-500">{errors.username.message}</p>
        )}
      </div>

      {/* 邮箱 */}
      <div className="space-y-2">
        <Label htmlFor="email">邮箱</Label>
        <Input
          id="email"
          type="email"
          {...register("email")}
          disabled={isLoading}
          placeholder="请输入邮箱"
        />
      </div>

      {/* 角色 */}
      <div className="space-y-2">
        <Label htmlFor="role">角色 *</Label>
        <Select
          value={role}
          onValueChange={(value) => setValue("role", value)}
          disabled={isLoading}
        >
          <SelectTrigger>
            <SelectValue placeholder="选择角色" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">管理员</SelectItem>
            <SelectItem value="user">用户</SelectItem>
            <SelectItem value="viewer">只读用户</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 密码 */}
      <div className="space-y-2">
        <Label htmlFor="password">
          {isEdit ? "新密码（留空则不修改）" : "密码 *"}
        </Label>
        <Input
          id="password"
          type="password"
          {...register("password", {
            required: !isEdit ? "密码不能为空" : false,
            minLength: { value: 6, message: "密码至少6位" },
          })}
          disabled={isLoading}
          placeholder={isEdit ? "留空则不修改密码" : "请输入密码（至少6位）"}
        />
        {errors.password && (
          <p className="text-sm text-red-500">{errors.password.message}</p>
        )}
      </div>

      {/* 确认密码 */}
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">
          {isEdit ? "确认新密码" : "确认密码 *"}
        </Label>
        <Input
          id="confirmPassword"
          type="password"
          {...register("confirmPassword", {
            required: !isEdit && watch("password") ? "请确认密码" : false,
          })}
          disabled={isLoading}
          placeholder={isEdit ? "留空则不修改密码" : "请再次输入密码"}
        />
      </div>

      {/* 按钮 */}
      <div className="flex justify-end space-x-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          取消
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "处理中..." : isEdit ? "更新" : "创建"}
        </Button>
      </div>
    </form>
  );
} 