import Asana from 'asana';

export class AsanaClientWrapper {
  private workspaces: any;
  private projects: any;
  private tasks: any;
  private stories: any;
  private projectStatuses: any;
  private tags: any;
  private customFieldSettings: any;
  private allowedProjectGid: string;
  private allowedWorkspaceGid: string;

  constructor(token: string, allowedProjectGid: string, allowedWorkspaceGid: string) {
    const client = Asana.ApiClient.instance;
    client.authentications['token'].accessToken = token;

    // Initialize API instances
    this.workspaces = new Asana.WorkspacesApi();
    this.projects = new Asana.ProjectsApi();
    this.tasks = new Asana.TasksApi();
    this.stories = new Asana.StoriesApi();
    this.projectStatuses = new Asana.ProjectStatusesApi();
    this.tags = new Asana.TagsApi();
    this.customFieldSettings = new Asana.CustomFieldSettingsApi();
    this.allowedProjectGid = allowedProjectGid;
    this.allowedWorkspaceGid = allowedWorkspaceGid;
  }

  async listWorkspaces(opts: any = {}) {
    // Only return the allowed workspace
    const response = await this.workspaces.getWorkspaces(opts);
    return (response.data || []).filter((ws: any) => ws.gid === this.allowedWorkspaceGid);
  }

  async searchProjects(workspace: string, namePattern: string, archived: boolean = false, opts: any = {}) {
    // Force workspace to allowed workspace
    workspace = this.allowedWorkspaceGid;
    const response = await this.projects.getProjectsForWorkspace(workspace, {
      archived,
      ...opts
    });
    const pattern = new RegExp(namePattern, 'i');
    return response.data.filter((project: any) => project.gid === this.allowedProjectGid && pattern.test(project.name));
  }

  async searchTasks(searchOpts: any = {}) {
    // Force workspace to allowed workspace
    const workspace = this.allowedWorkspaceGid;
    // Always scope search to the allowed project using projects.any
    const { projects_any, projects_not, projects_all, opt_fields, ...rest } = searchOpts;
    const scopedSearchOpts = { ...rest };

    // Build search parameters
    const searchParams: any = {
      ...scopedSearchOpts
    };

    // Enforce project scoping
    searchParams['projects.any'] = this.allowedProjectGid;

    // Ensure we request projects in the response so we can filter locally as a safety net
    const requiredFields = ['projects'];
    if (opt_fields && typeof opt_fields === 'string' && opt_fields.trim().length > 0) {
      const parts = opt_fields.split(',').map((s: string) => s.trim()).filter(Boolean);
      requiredFields.forEach((f) => { if (!parts.includes(f)) parts.push(f); });
      searchParams.opt_fields = parts.join(',');
    } else {
      searchParams.opt_fields = requiredFields.join(',');
    }

    const response = await this.tasks.searchTasksForWorkspace(workspace, searchParams);

    // Safety net: filter any tasks that somehow are not in the allowed project
    const filtered = [];
    for (const task of response.data || []) {
      const projects = Array.isArray(task?.projects) ? task.projects : [];
      
      // Check if task is directly in allowed project
      if (projects.some((p: any) => p?.gid === this.allowedProjectGid)) {
        filtered.push(task);
      }
      // For subtasks (no projects), check if parent is in allowed project
      else if (projects.length === 0 && task?.parent?.gid) {
        try {
          const parentTask = await this.tasks.getTask(task.parent.gid, { opt_fields: 'projects' });
          const parentProjects = Array.isArray(parentTask.data?.projects) ? parentTask.data.projects : [];
          if (parentProjects.some((p: any) => p?.gid === this.allowedProjectGid)) {
            filtered.push(task);
          }
        } catch (error) {
          // If we can't verify parent, reject for security
          console.warn(`Could not verify parent task ${task.parent.gid} for subtask ${task.gid}`);
        }
      }
    }

    // Transform the response to simplify custom fields if present
    const transformedData = filtered.map((task: any) => {
      if (!task.custom_fields) return task;

      return {
        ...task,
        custom_fields: task.custom_fields.reduce((acc: any, field: any) => {
          const key = `${field.name} (${field.gid})`;
          let value = field.display_value;

          // For enum fields with a value, include the enum option GID
          if (field.type === 'enum' && field.enum_value) {
            value = `${field.display_value} (${field.enum_value.gid})`;
          }

          acc[key] = value;
          return acc;
        }, {})
      };
    });

    return transformedData;
  }

  private ensureTaskInAllowedProject = async (taskId: string) => {
    const task = await this.tasks.getTask(taskId, { opt_fields: 'projects' });
    const inProject = Array.isArray(task.data?.projects) && task.data.projects.some((p: any) => p.gid === this.allowedProjectGid);
    if (!inProject) {
      throw new Error(`Access to task ${taskId} is denied. Task is not in allowed project ${this.allowedProjectGid}.`);
    }
  }

  async getTask(taskId: string, opts: any = {}) {
    await this.ensureTaskInAllowedProject(taskId);
    const response = await this.tasks.getTask(taskId, opts);
    return response.data;
  }

  async createTask(projectId: string, data: any) {
    // Override projectId to the allowed project
    projectId = this.allowedProjectGid;
    // Ensure projects array includes the projectId
    const projects = data.projects || [];
    if (!projects.includes(projectId)) {
      projects.push(projectId);
    }

    const taskData = {
      data: {
        ...data,
        projects,
        // Handle resource_subtype if provided
        resource_subtype: data.resource_subtype || 'default_task',
        // Handle custom_fields if provided
        custom_fields: data.custom_fields || {}
      }
    };
    const response = await this.tasks.createTask(taskData);
    return response.data;
  }

  async getStoriesForTask(taskId: string, opts: any = {}) {
    await this.ensureTaskInAllowedProject(taskId);
    const response = await this.stories.getStoriesForTask(taskId, opts);
    return response.data;
  }

  async updateTask(taskId: string, data: any) {
    await this.ensureTaskInAllowedProject(taskId);
    const body = {
      data: {
        ...data,
        // Handle resource_subtype if provided
        resource_subtype: data.resource_subtype || undefined,
        // Handle custom_fields if provided
        custom_fields: data.custom_fields || undefined
      }
    };
    const opts = {};
    const response = await this.tasks.updateTask(body, taskId, opts);
    return response.data;
  }

  async getProject(projectId: string, opts: any = {}) {
    if (projectId !== this.allowedProjectGid) {
      throw new Error(`Access to project ${projectId} is denied. Only project ${this.allowedProjectGid} is allowed.`);
    }
    // Only include opts if opt_fields was actually provided
    const options = opts.opt_fields ? opts : {};
    const response = await this.projects.getProject(projectId, options);
    return response.data;
  }

  async getProjectCustomFieldSettings(projectId: string, opts: any = {}) {
    if (projectId !== this.allowedProjectGid) {
      throw new Error(`Access to project ${projectId} is denied. Only project ${this.allowedProjectGid} is allowed.`);
    }
    try {
      const options = {
        limit: 100,
        opt_fields: opts.opt_fields || "custom_field,custom_field.name,custom_field.gid,custom_field.resource_type,custom_field.type,custom_field.description,custom_field.enum_options,custom_field.enum_options.name,custom_field.enum_options.gid,custom_field.enum_options.enabled"
      };

      const response = await this.customFieldSettings.getCustomFieldSettingsForProject(projectId, options);
      return response.data;
    } catch (error) {
      console.error(`Error fetching custom field settings for project ${projectId}:`, error);
      return [];
    }
  }

  async getProjectTaskCounts(projectId: string, opts: any = {}) {
    if (projectId !== this.allowedProjectGid) {
      throw new Error(`Access to project ${projectId} is denied. Only project ${this.allowedProjectGid} is allowed.`);
    }
    // Only include opts if opt_fields was actually provided
    const options = opts.opt_fields ? opts : {};
    const response = await this.projects.getTaskCountsForProject(projectId, options);
    return response.data;
  }

  async getProjectSections(projectId: string, opts: any = {}) {
    if (projectId !== this.allowedProjectGid) {
      throw new Error(`Access to project ${projectId} is denied. Only project ${this.allowedProjectGid} is allowed.`);
    }
    // Only include opts if opt_fields was actually provided
    const options = opts.opt_fields ? opts : {};
    const sections = new Asana.SectionsApi();
    const response = await sections.getSectionsForProject(projectId, options);
    return response.data;
  }

  async createTaskStory(taskId: string, text: string | null = null, opts: any = {}, html_text: string | null = null) {
    await this.ensureTaskInAllowedProject(taskId);
    const options = opts.opt_fields ? opts : {};
    const data: any = {};

    if (text) {
      data.text = text;
    } else if (html_text) {
      data.html_text = html_text;
    } else {
      throw new Error("Either text or html_text must be provided");
    }

    const body = { data };
    const response = await this.stories.createStoryForTask(body, taskId, options);
    return response.data;
  }

  async addTaskDependencies(taskId: string, dependencies: string[]) {
    await this.ensureTaskInAllowedProject(taskId);
    const body = {
      data: {
        dependencies: dependencies
      }
    };
    const response = await this.tasks.addDependenciesForTask(body, taskId);
    return response.data;
  }

  async addTaskDependents(taskId: string, dependents: string[]) {
    await this.ensureTaskInAllowedProject(taskId);
    const body = {
      data: {
        dependents: dependents
      }
    };
    const response = await this.tasks.addDependentsForTask(body, taskId);
    return response.data;
  }

  async createSubtask(parentTaskId: string, data: any, opts: any = {}) {
    await this.ensureTaskInAllowedProject(parentTaskId);
    const taskData = {
      data: {
        ...data
      }
    };
    const response = await this.tasks.createSubtaskForTask(taskData, parentTaskId, opts);
    return response.data;
  }

  async setParentForTask(data: any, taskId: string, opts: any = {}) {
    await this.ensureTaskInAllowedProject(taskId);
    const response = await this.tasks.setParentForTask({ data }, taskId, opts);
    return response.data;
  }

  async getProjectStatus(statusId: string, opts: any = {}) {
    // Disallow fetching a status by ID directly in restricted mode to prevent cross-project access
    throw new Error("Access to project status by ID is not allowed in project-restricted mode. Use getProjectStatusesForProject instead.");
  }

  async getProjectStatusesForProject(projectId: string, opts: any = {}) {
    if (projectId !== this.allowedProjectGid) {
      throw new Error(`Access to project ${projectId} is denied. Only project ${this.allowedProjectGid} is allowed.`);
    }
    const response = await this.projectStatuses.getProjectStatusesForProject(projectId, opts);
    return response.data;
  }

  async createProjectStatus(projectId: string, data: any) {
    if (projectId !== this.allowedProjectGid) {
      throw new Error(`Access to project ${projectId} is denied. Only project ${this.allowedProjectGid} is allowed.`);
    }
    const body = { data };
    const response = await this.projectStatuses.createProjectStatusForProject(body, projectId);
    return response.data;
  }

  async deleteProjectStatus(statusId: string) {
    // Best-effort validation: fetch status to ensure it belongs to allowed project
    try {
      const status = await (this.projectStatuses as any).getProjectStatus(statusId, { opt_fields: 'project' });
      const projectGid = status?.data?.project?.gid || status?.data?.parent?.gid;
      if (projectGid && projectGid !== this.allowedProjectGid) {
        throw new Error(`Access to project status ${statusId} is denied. It does not belong to project ${this.allowedProjectGid}.`);
      }
    } catch (err) {
      // If we cannot determine project ownership, deny to be safe
      throw new Error("Unable to verify project ownership for project status; deletion is not allowed in restricted mode.");
    }
    const response = await this.projectStatuses.deleteProjectStatus(statusId);
    return response.data;
  }

  async getMultipleTasksByGid(taskIds: string[], opts: any = {}) {
    if (taskIds.length > 25) {
      throw new Error("Maximum of 25 task IDs allowed");
    }

    // Use Promise.all to fetch tasks in parallel (with project validation per task)
    const tasks = await Promise.all(
      taskIds.map(async taskId => {
        await this.ensureTaskInAllowedProject(taskId);
        return this.getTask(taskId, opts);
      })
    );

    // Safety net: filter any tasks that somehow are not in the allowed project
    return tasks.filter((task: any) => {
      const projects = Array.isArray(task?.projects) ? task.projects : [];
      return projects.some((p: any) => p?.gid === this.allowedProjectGid);
    });
  }

  async getTasksForTag(tag_gid: string, opts: any = {}) {
    // We cannot scope tags to project directly; reject to prevent cross-project data
    throw new Error("Access to tags across workspace is not allowed in project-restricted mode.");
  }

  async getTagsForWorkspace(workspace_gid: string, opts: any = {}) {
    // Disallow broad workspace tag listing in restricted mode
    throw new Error("Access to workspace tags is not allowed in project-restricted mode.");
  }
}
