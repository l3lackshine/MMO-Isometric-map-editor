import { contextBridge } from "electron";
contextBridge.exposeInMainWorld("appInfo", { name: "Blackshine Map Editor", version: "1.0.0" });