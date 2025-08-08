import { Tool, CallToolRequest, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { AsanaClientWrapper } from './asana-client-wrapper.js';
import { validateAsanaXml } from './asana-validate-xml.js';

// Removed: import { listWorkspacesTool } from './tools/workspace-tools.js';
import {
  // Removed: searchProjectsTool,
  getProjectTool,
  getProjectTaskCountsTool,
  getProjectSectionsTool
} from './tools/project-tools.js';
import {
  // Removed getProjectStatusTool (ID-based) to avoid exposing it
  getProjectStatusesForProjectTool,
  // Removed: createProjectStatusTool,
  // Removed: deleteProjectStatusTool
} from './tools/project-status-tools.js';
import {
  searchTasksTool,
  getTaskTool,
  // Removed: createTaskTool,
  // Removed: updateTaskTool,
  // Removed: createSubtaskTool,
  getMultipleTasksByGidTool
} from './tools/task-tools.js';
import { getTasksForTagTool, getTagsForWorkspaceTool } from './tools/tag-tools.js';
import {
  // Removed: addTaskDependenciesTool,
  // Removed: addTaskDependentsTool,
  // Removed: setParentForTaskTool
} from './tools/task-relationship-tools.js';
import {
  getStoriesForTaskTool,
  // Removed: createTaskStoryTool
} from './tools/story-tools.js';

// List of all available tools (workspace/project listing and mutations removed)
const all_tools: Tool[] = [
  // listWorkspacesTool, // removed
  // searchProjectsTool, // removed
  searchTasksTool,
  getTaskTool,
  getStoriesForTaskTool,
  getProjectTool,
  getProjectTaskCountsTool,
  getProjectSectionsTool,
  getMultipleTasksByGidTool,
  // getProjectStatusTool, // removed
  getProjectStatusesForProjectTool,
  // createProjectStatusTool, // removed
  // deleteProjectStatusTool, // removed
  // setParentForTaskTool, // removed
  // addTaskDependenciesTool, // removed
  // addTaskDependentsTool, // removed
  // createTaskTool, // removed
  // updateTaskTool, // removed
  // createSubtaskTool, // removed
  getTasksForTagTool,
  getTagsForWorkspaceTool,
];

// List of tools that only read Asana state
const READ_ONLY_TOOLS = [
  // 'asana_list_workspaces', // removed
  // 'asana_search_projects', // removed
  'asana_search_tasks',
  'asana_get_task',
  'asana_get_task_stories',
  'asana_get_project',
  'asana_get_project_task_counts',
  // 'asana_get_project_status', // removed
  'asana_get_project_statuses',
  'asana_get_project_sections',
  'asana_get_multiple_tasks_by_gid',
  'asana_get_tasks_for_tag',
  'asana_get_tags_for_workspace'
];

// Filter tools based on READ_ONLY_MODE
const isReadOnlyMode = process.env.READ_ONLY_MODE === 'true';

// Always-disabled mutation tools
const DISABLED_TOOLS = new Set<string>([
  'asana_create_task',
  'asana_update_task',
  'asana_create_subtask',
  'asana_set_parent_for_task',
  'asana_create_task_story',
  'asana_add_task_dependencies',
  'asana_add_task_dependents',
  'asana_create_project_status',
  'asana_delete_project_status',
]);

// Restrict tools when ASANA_PROJECT_GID is set
const isProjectRestricted = !!process.env.ASANA_PROJECT_GID;
const DISALLOWED_WHEN_RESTRICTED = new Set<string>([
  // hide workspace/project listing in restricted mode
  'asana_list_workspaces',
  'asana_search_projects',
  // cross-project reads are blocked
  'asana_get_tags_for_workspace',
  'asana_get_tasks_for_tag',
  // ID-based status fetch blocked
  'asana_get_project_status',
]);

// Export filtered list of tools
export const list_of_tools = (isReadOnlyMode ? all_tools.filter(tool => READ_ONLY_TOOLS.includes(tool.name)) : all_tools)
  .filter(tool => !DISABLED_TOOLS.has(tool.name))
  .filter(tool => !isProjectRestricted || !DISALLOWED_WHEN_RESTRICTED.has(tool.name));

export function tool_handler(asanaClient: AsanaClientWrapper): (request: CallToolRequest) => Promise<CallToolResult> {
  return async (request: CallToolRequest) => {
    console.error("Received CallToolRequest:", request);
    try {
      if (!request.params.arguments) {
        throw new Error("No arguments provided");
      }

      // Hard-disable mutation tools
      if (DISABLED_TOOLS.has(request.params.name)) {
        throw new Error(`Tool ${request.params.name} is disabled in this server build`);
      }

      // Block non-read operations in read-only mode
      if (isReadOnlyMode && !READ_ONLY_TOOLS.includes(request.params.name)) {
        throw new Error(`Tool ${request.params.name} is not available in read-only mode`);
      }

      // Block disallowed tools in project-restricted mode
      if (isProjectRestricted && DISALLOWED_WHEN_RESTRICTED.has(request.params.name)) {
        throw new Error(`Tool ${request.params.name} is not available in project-restricted mode`);
      }

      const args = request.params.arguments as any;

      switch (request.params.name) {
        // note: list_workspaces and search_projects removed from registry
        case "asana_search_tasks": {
          const { workspace: _ignored, ...searchOpts } = args;
          const response = await asanaClient.searchTasks(searchOpts);
          return { content: [{ type: "text", text: JSON.stringify(response) }] };
        }

        case "asana_get_task": {
          const { task_id, ...opts } = args;
          const response = await asanaClient.getTask(task_id, opts);
          return { content: [{ type: "text", text: JSON.stringify(response) }] };
        }

        case "asana_get_task_stories": {
          const { task_id, ...opts } = args;
          const response = await asanaClient.getStoriesForTask(task_id, opts);
          return { content: [{ type: "text", text: JSON.stringify(response) }] };
        }

        case "asana_get_project": {
          const { project_id: _ignored, ...opts } = args;
          const response = await asanaClient.getProject(process.env.ASANA_PROJECT_GID as string, opts);
          return { content: [{ type: "text", text: JSON.stringify(response) }] };
        }

        case "asana_get_project_task_counts": {
          const { project_id: _ignored, ...opts } = args;
          const response = await asanaClient.getProjectTaskCounts(process.env.ASANA_PROJECT_GID as string, opts);
          return { content: [{ type: "text", text: JSON.stringify(response) }] };
        }

        case "asana_get_project_statuses": {
          const { project_gid: _ignored, ...opts } = args;
          const response = await asanaClient.getProjectStatusesForProject(process.env.ASANA_PROJECT_GID as string, opts);
          return { content: [{ type: "text", text: JSON.stringify(response) }] };
        }

        case "asana_get_project_sections": {
          const { project_id: _ignored, ...opts } = args;
          const response = await asanaClient.getProjectSections(process.env.ASANA_PROJECT_GID as string, opts);
          return { content: [{ type: "text", text: JSON.stringify(response) }] };
        }

        case "asana_get_multiple_tasks_by_gid": {
          const { task_ids, ...opts } = args;
          const taskIdList = Array.isArray(task_ids)
            ? task_ids
            : task_ids.split(',').map((id: string) => id.trim()).filter((id: string) => id.length > 0);
          const response = await asanaClient.getMultipleTasksByGid(taskIdList, opts);
          return { content: [{ type: "text", text: JSON.stringify(response) }] };
        }

        case "asana_get_tasks_for_tag": {
          const { tag_gid, ...opts } = args;
          const response = await asanaClient.getTasksForTag(tag_gid, opts);
          return { content: [{ type: "text", text: JSON.stringify(response) }] };
        }

        case "asana_get_tags_for_workspace": {
          const { workspace_gid, ...opts } = args;
          const response = await asanaClient.getTagsForWorkspace(workspace_gid, opts);
          return { content: [{ type: "text", text: JSON.stringify(response) }] };
        }

        default:
          throw new Error(`Unknown or disabled tool: ${request.params.name}`);
      }
    } catch (error) {
      console.error("Error executing tool:", error);
      const errorResponse = { error: error instanceof Error ? error.message : String(error) };
      return { content: [{ type: "text", text: JSON.stringify(errorResponse) }] };
    }
  };
}
