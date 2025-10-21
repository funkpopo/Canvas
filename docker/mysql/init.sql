-- MySQL数据库初始化脚本
-- 此脚本在MySQL容器首次启动时执行

-- 创建canvas数据库（如果不存在）
CREATE DATABASE IF NOT EXISTS canvas CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 使用canvas数据库
USE canvas;

-- 设置字符集
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;
