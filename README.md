# dsh-whale-console · 鲸鱼娘控制台

DSH 插件：在设置页一键管理本地桌面宠物、本地语音和本地模型。仅支持 Windows。

## 配置

在插件配置里设置脚本目录（不设置时只显示状态，按钮不可用）：

    - id: dsh-whale-console
      name: dsh-whale-console
      config:
        scriptsDir: E:\scripts-ai
        powershell: powershell.exe
        petMatch: surfpet
        ports: { voice: 8765, gsv: 9880, llama: 8080, ollama: 11434 }

- scriptsDir：脚本目录（必填）
- powershell：PowerShell 可执行文件（默认 powershell.exe）
- petMatch：桌宠进程命令行匹配词（默认 surfpet）
- ports：语音 / 引擎 / 本地模型 / Ollama 端口（默认 8765 / 9880 / 8080 / 11434）
- scripts：脚本名覆盖（默认 pet-with-voice.ps1 / start-voice.ps1 / start-all.ps1）

配置改完需要重启 DSH 生效。

## 功能

- 状态灯：桌宠 / 语音服务 / 语音引擎 / 本地模型 / Ollama（端口按配置显示）
- 一键启动（桌宠 + 语音）
- 一键关闭（释放内存与显存）
- 只开语音 / 只开本地模型
- 状态每 4 秒自动刷新（进程探测缓存 9 秒）
- 脚本缺失时直接提示具体路径

## 安装

    dsh plugin install_bundle --target npm:dsh-whale-console

装完重启 DSH，设置页出现「鲸鱼娘控制台」。

## 依赖的本地服务

插件本身不安装服务，只调用配置目录里已有的脚本：

| 控件 | 脚本 |
| --- | --- |
| 一键启动 | pet-with-voice.ps1 |
| 只开语音 | start-voice.ps1 |
| 只开本地模型 | start-all.ps1 |
| 一键关闭 | 内置 PowerShell（按配置端口停止监听进程与桌宠进程） |

## 权限与安全

- 只注册本机 HTTP 路由 /dsh-whale-console/api/*
- 通过 PowerShell 启动/停止本机已有的脚本与进程（使用 -ExecutionPolicy Bypass）
- 不读取密钥、不写凭据
- 仅支持 Windows

## License

MIT
