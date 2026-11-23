import { contextBridge } from "electron";
contextBridge.exposeInMainWorld("appInfo", { name: "Blackshine Map Editor", version: "0.2.0" });