"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LogOut, Database, ArrowLeft, FileText, Folder, Eye, Loader2, HardDrive } from "lucide-react";
import ClusterSelector from "@/components/ClusterSelector";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { storageApi } from "@/lib/api";

interface FileItem {
  name: string;
  type: string;
  size: number | null;
  modified_time: string | null;
  permissions: string | null;
}

interface PersistentVolume {
  name: string;
  capacity: string;
  access_modes: string[];
  status: string;
  claim: string | null;
  storage_class: string | null;
  volume_mode: string;
  cluster_name: string;
  cluster_id: number;
}

export default function VolumeDetail() {
  const params = useParams();
  const volumeName = params.name as string;

  const [volume, setVolume] = useState<PersistentVolume | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentPath, setCurrentPath] = useState("/");
  const [isLoading] = useState(true);
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isFileDialogOpen, setIsFileDialogOpen] = useState(false);

  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const { activeCluster } = useCluster();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
      return;
    }

    if (activeCluster) {
      setSelectedClusterId(activeCluster.id);
      loadVolumeData();
      loadFiles();
    }
  }, [isAuthenticated, authLoading, router, activeCluster, volumeName, currentPath]);

  const loadVolumeData = async () => {
    if (!selectedClusterId || !volumeName) return;

    try {
      const response = await storageApi.getPersistentVolume(selectedClusterId, volumeName);
      if (response.data) {
        setVolume(response.data);
      }
    } catch (error) {
      console.error("加载持久卷详情失败:", error);
    }
  };

  const loadFiles = async () => {
    if (!selectedClusterId || !volumeName) return;

    try {
      const response = await storageApi.browseVolumeFiles(selectedClusterId, volumeName, currentPath);
      if (response.data) {
        setFiles(response.data.files || []);
      }
    } catch (error) {
      console.error("加载文件列表失败:", error);
      setFiles([]);
    }
  };

  const handleFileClick = async (fileName: string, fileType: string) => {
    if (fileType === "directory") {
      const newPath = currentPath === "/" ? `/${fileName}` : `${currentPath}/${fileName}`;
      setCurrentPath(newPath);
    } else {
      // 查看文件内容
      try {
        const response = await storageApi.readVolumeFile(selectedClusterId!, volumeName, `${currentPath === "/" ? "" : currentPath}/${fileName}`);
        if (response.data) {
          setFileContent(response.data.content);
          setSelectedFile(fileName);
          setIsFileDialogOpen(true);
        }
      } catch (error) {
        console.error("读取文件内容失败:", error);
      }
    }
  };

  const handlePathNavigation = (path: string) => {
    setCurrentPath(path);
  };

  const getPathSegments = () => {
    if (currentPath === "/") return [];
    return currentPath.split("/").filter(segment => segment);
  };

  // 显示loading状态
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Database className="h-8 w-8 text-blue-600" />
              <h1 className="ml-2 text-xl font-semibold text-gray-900 dark:text-white">
                Kubernetes管理面板
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <ClusterSelector />
              <Button variant="outline" onClick={logout}>
                <LogOut className="h-4 w-4 mr-2" />
                登出
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button variant="outline" asChild>
                <Link href="/storage">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  返回存储管理
                </Link>
              </Button>
              <div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                  持久卷详情
                </h2>
                <p className="mt-2 text-gray-600 dark:text-gray-400">
                  查看持久卷信息和文件内容
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 卷信息卡片 */}
        {volume && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center">
                <HardDrive className="h-5 w-5 mr-2" />
                {volume.name}
              </CardTitle>
              <CardDescription>持久卷详细信息</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">容量</p>
                  <p className="text-lg font-semibold">{volume.capacity}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">状态</p>
                  <Badge variant={volume.status === 'Available' ? 'default' : 'secondary'}>
                    {volume.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">访问模式</p>
                  <div className="flex flex-wrap gap-1">
                    {volume.access_modes.map((mode) => (
                      <Badge key={mode} variant="outline">{mode}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">存储类</p>
                  <p className="text-sm">{volume.storage_class || '无'}</p>
                </div>
              </div>
              {volume.claim && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-500">绑定声明</p>
                  <p className="text-sm">{volume.claim}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 文件浏览器 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <FileText className="h-5 w-5 mr-2" />
              卷内文件浏览
            </CardTitle>
            <CardDescription>浏览和查看持久卷中的文件</CardDescription>
          </CardHeader>
          <CardContent>
            {/* 路径导航 */}
            <div className="mb-4">
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <Button
                  variant="link"
                  className="p-0 h-auto font-normal"
                  onClick={() => handlePathNavigation("/")}
                >
                  根目录
                </Button>
                {getPathSegments().map((segment, index) => {
                  const path = "/" + getPathSegments().slice(0, index + 1).join("/");
                  return (
                    <div key={path} className="flex items-center">
                      <span className="mx-1">/</span>
                      <Button
                        variant="link"
                        className="p-0 h-auto font-normal"
                        onClick={() => handlePathNavigation(path)}
                      >
                        {segment}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>大小</TableHead>
                    <TableHead>修改时间</TableHead>
                    <TableHead>权限</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {files.map((file) => (
                    <TableRow key={file.name}>
                      <TableCell className="font-medium">
                        <div className="flex items-center">
                          {file.type === "directory" ? (
                            <Folder className="h-4 w-4 mr-2 text-blue-500" />
                          ) : (
                            <FileText className="h-4 w-4 mr-2 text-gray-500" />
                          )}
                          <span
                            className={file.type === "directory" ? "text-blue-600 cursor-pointer hover:underline" : "cursor-pointer hover:underline"}
                            onClick={() => handleFileClick(file.name, file.type)}
                          >
                            {file.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{file.type === "directory" ? "目录" : "文件"}</TableCell>
                      <TableCell>
                        {file.size !== null ? `${(file.size / 1024).toFixed(1)} KB` : '-'}
                      </TableCell>
                      <TableCell>{file.modified_time || '-'}</TableCell>
                      <TableCell className="font-mono text-sm">{file.permissions || '-'}</TableCell>
                      <TableCell>
                        {file.type === "file" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleFileClick(file.name, file.type)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            查看
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {files.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                        此目录为空
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* 文件内容对话框 */}
        <Dialog open={isFileDialogOpen} onOpenChange={setIsFileDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>文件内容 - {selectedFile}</DialogTitle>
              <DialogDescription>
                路径: {currentPath === "/" ? "" : currentPath}/{selectedFile}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-auto">
              <pre className="text-sm font-mono bg-gray-50 dark:bg-gray-800 p-4 rounded whitespace-pre-wrap">
                {fileContent}
              </pre>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
