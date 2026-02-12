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
import { useTranslations } from "@/hooks/use-translations";

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
  const t = useTranslations("storageVolume");
  const tAuth = useTranslations("auth");
  const tCommon = useTranslations("common");

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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Database className="h-8 w-8 text-zinc-600" />
              <h1 className="ml-2 text-xl font-semibold text-gray-900 dark:text-white">
                Canvas
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <ClusterSelector />
              <Button variant="outline" onClick={logout}>
                <LogOut className="h-4 w-4 mr-2" />
                {tAuth("logout")}
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
                  {t("backToStorage")}
                </Link>
              </Button>
              <div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                  {t("title")}
                </h2>
                <p className="mt-2 text-gray-600 dark:text-gray-400">
                  {t("description")}
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
              <CardDescription>{t("volumeDetails")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">{t("capacityLabel")}</p>
                  <p className="text-lg font-semibold">{volume.capacity}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">{t("statusLabel")}</p>
                  <Badge variant={volume.status === 'Available' ? 'default' : 'secondary'}>
                    {volume.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">{t("accessModesLabel")}</p>
                  <div className="flex flex-wrap gap-1">
                    {volume.access_modes.map((mode) => (
                      <Badge key={mode} variant="outline">{mode}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">{t("storageClassLabel")}</p>
                  <p className="text-sm">{volume.storage_class || t("noneValue")}</p>
                </div>
              </div>
              {volume.claim && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-500">{t("boundClaimLabel")}</p>
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
              {t("fileBrowserTitle")}
            </CardTitle>
            <CardDescription>{t("fileBrowserDescription")}</CardDescription>
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
                  {t("rootDirectory")}
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
                    <TableHead>{t("nameLabel")}</TableHead>
                    <TableHead>{t("typeLabel")}</TableHead>
                    <TableHead>{t("sizeLabel")}</TableHead>
                    <TableHead>{t("modifiedTimeLabel")}</TableHead>
                    <TableHead>{t("permissionsLabel")}</TableHead>
                    <TableHead>{tCommon("actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {files.map((file) => (
                    <TableRow key={file.name}>
                      <TableCell className="font-medium">
                        <div className="flex items-center">
                          {file.type === "directory" ? (
                            <Folder className="h-4 w-4 mr-2 text-zinc-500" />
                          ) : (
                            <FileText className="h-4 w-4 mr-2 text-gray-500" />
                          )}
                          <span
                            className={file.type === "directory" ? "text-zinc-600 cursor-pointer hover:underline" : "cursor-pointer hover:underline"}
                            onClick={() => handleFileClick(file.name, file.type)}
                          >
                            {file.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{file.type === "directory" ? t("directoryType") : t("fileType")}</TableCell>
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
                            {t("viewAction")}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {files.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                        {t("emptyDirectory")}
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
              <DialogTitle>{t("fileContentTitle", { file: selectedFile })}</DialogTitle>
              <DialogDescription>
                {t("pathValue", { path: `${currentPath === "/" ? "" : currentPath}/${selectedFile}` })}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-auto">
              <pre className="text-sm font-mono bg-muted p-4 rounded whitespace-pre-wrap">
                {fileContent}
              </pre>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
