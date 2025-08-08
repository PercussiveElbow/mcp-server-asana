import { Tool } from "@modelcontextprotocol/sdk/types.js";

// export const addTaskDependenciesTool: Tool = {
//   name: "asana_add_task_dependencies",
//   description: "Add dependencies to a task",
//   inputSchema: {
//     type: "object",
//     properties: {
//       task_id: {
//         type: "string",
//         description: "The task ID to add dependencies to"
//       },
//       dependencies: {
//         type: "array",
//         items: { type: "string" },
//         description: "Array of task IDs that the task depends on"
//       }
//     },
//     required: ["task_id", "dependencies"]
//   }
// };

// export const addTaskDependentsTool: Tool = {
//   name: "asana_add_task_dependents",
//   description: "Add dependents to a task",
//   inputSchema: {
//     type: "object",
//     properties: {
//       task_id: {
//         type: "string",
//         description: "The task ID to add dependents to"
//       },
//       dependents: {
//         type: "array",
//         items: { type: "string" },
//         description: "Array of task IDs that depend on this task"
//       }
//     },
//     required: ["task_id", "dependents"]
//   }
// };

// export const setParentForTaskTool: Tool = {
//   name: "asana_set_parent_for_task",
//   description: "Set the parent of a task and position the subtask",
//   inputSchema: {
//     type: "object",
//     properties: {
//       task_id: {
//         type: "string",
//         description: "The task ID to operate on"
//       },
//       data: {
//         type: "object",
//         description: "Payload containing parent and position info"
//       },
//       opts: {
//         type: "object",
//         description: "Optional parameters"
//       }
//     },
//     required: ["task_id", "data"]
//   }
// };
