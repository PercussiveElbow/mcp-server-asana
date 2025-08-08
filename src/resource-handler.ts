import {
  ListResourcesResult,
  ListResourceTemplatesResult,
  ReadResourceResult,
  ReadResourceRequest
} from "@modelcontextprotocol/sdk/types.js";
import { AsanaClientWrapper } from './asana-client-wrapper.js';

export function createResourceHandlers(asanaClient: AsanaClientWrapper, allowedProjectGid: string) {
  /**
   * Lists available resources (workspaces and resource templates)
   */
  const listResources = async (): Promise<ListResourcesResult> => {
    console.error("Received ListResourcesRequest");
    try {
      // Only expose the allowed project as a resource
      return {
        resources: [
          {
            uri: `asana://project/${allowedProjectGid}`,
            name: `Asana project ${allowedProjectGid}`,
            description: `Restricted Asana project (${allowedProjectGid})`
          }
        ],
        resourceTemplates: []
      };
    } catch (error) {
      console.error("Error listing resources:", error);
      return { resources: [] };
    }
  };

  /**
   * Reads a resource (restricted to the allowed project)
   */
  const readResource = async (request: ReadResourceRequest): Promise<ReadResourceResult> => {
    console.error("Received ReadResourceRequest:", request);
    try {
      const { uri } = request.params;

      // Parse project URI
      const projectMatch = uri.match(/^asana:\/\/project\/([^\/]+)$/);
      if (projectMatch) {
        const projectId = projectMatch[1];
        if (projectId !== allowedProjectGid) {
          throw new Error(`Access to project ${projectId} is denied. Only project ${allowedProjectGid} is allowed.`);
        }
        return await readProjectResource(projectId, uri);
      }

      throw new Error(`Invalid or unauthorized resource URI: ${uri}`);
    } catch (error) {
      console.error("Error reading resource:", error);
      throw error instanceof Error ? error : new Error(String(error));
    }
  };

  /**
   * Read project resource
   */
  const readProjectResource = async (projectId: string, uri: string): Promise<ReadResourceResult> => {
    try {
      // Get project details
      const project = await asanaClient.getProject(projectId, {
        opt_fields: "name,gid,resource_type,created_at,modified_at,archived,public,notes,color,default_view,due_date,due_on,start_on,workspace,team"
      });

      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }

      // Get project sections - handle potential errors
      let sections = [];
      try {
        sections = await asanaClient.getProjectSections(projectId, {
          opt_fields: "name,gid,created_at"
        });
      } catch (sectionError) {
        console.error(`Error fetching sections for project ${projectId}:`, sectionError);
        // Continue with empty sections array
      }

      // Get custom field settings directly
      let customFields: any[] = [];
      try {
        const customFieldSettings = await asanaClient.getProjectCustomFieldSettings(projectId, {
          opt_fields: "custom_field.name,custom_field.gid,custom_field.resource_type,custom_field.type,custom_field.description,custom_field.enum_options,custom_field.enum_options.gid,custom_field.enum_options.name,custom_field.enum_options.enabled,custom_field.precision,custom_field.format"
        });

        if (customFieldSettings && Array.isArray(customFieldSettings)) {
          customFields = customFieldSettings
            .filter((setting: any) => setting && setting.custom_field)
            .map((setting: any) => {
              const field = setting.custom_field;
              let fieldData: any = {
                gid: field.gid || null,
                name: field.name || null,
                type: field.resource_type || null,
                field_type: field.type || null,
                description: field.description || null
              };

              // Add field type specific properties
              switch (field.type) {
                case 'enum':
                  if (field.enum_options && Array.isArray(field.enum_options)) {
                    fieldData.enum_options = field.enum_options
                      .filter((option: any) => option.enabled !== false)
                      .map((option: any) => ({
                        gid: option.gid || null,
                        name: option.name || null
                      }));
                  }
                  break;
                case 'multi_enum':
                  if (field.enum_options && Array.isArray(field.enum_options)) {
                    fieldData.enum_options = field.enum_options
                      .filter((option: any) => option.enabled !== false)
                      .map((option: any) => ({
                        gid: option.gid || null,
                        name: option.name || null
                      }));
                  }
                  break;
                case 'number':
                  fieldData.precision = field.precision || 0;
                  break;
                case 'text':
                case 'date':
                  // No special handling needed
                  break;
                case 'people':
                  // No special handling needed
                  break;
              }

              return fieldData;
            });
        }
      } catch (customFieldError) {
        console.error(`Error fetching custom fields for project ${projectId}:`, customFieldError);
        // Continue with empty customFields array
      }

      // Format project data with sections and custom fields
      const projectData = {
        name: project.name || null,
        id: project.gid || null,
        type: project.resource_type || null,
        created_at: project.created_at || null,
        modified_at: project.modified_at || null,
        archived: project.archived || false,
        public: project.public || false,
        notes: project.notes || null,
        color: project.color || null,
        default_view: project.default_view || null,
        due_date: project.due_date || null,
        due_on: project.due_on || null,
        start_on: project.start_on || null,
        workspace: project.workspace ? {
          gid: project.workspace.gid || null,
          name: project.workspace.name || null
        } : null,
        team: project.team ? {
          gid: project.team.gid || null,
          name: project.team.name || null
        } : null,
        sections: sections ? sections.map((section: any) => ({
          gid: section.gid || null,
          name: section.name || null,
          created_at: section.created_at || null
        })) : [],
        custom_fields: customFields || []
      };

      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(projectData, null, 2)
          }
        ]
      };
    } catch (error) {
      console.error(`Error reading project ${projectId}:`, error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to read project: ${message}`);
    }
  };

  /**
   * Lists available resource templates (project template)
   */
  const listResourceTemplates = async (): Promise<ListResourceTemplatesResult> => {
    console.error("Received ListResourceTemplatesRequest");
    try {
      // Restrict templates to only the allowed project format
      const resourceTemplates = [
        {
          uriTemplate: `asana://project/${allowedProjectGid}`,
          name: "Asana Allowed Project",
          description: "Access to the configured Asana project only",
          mimeType: "application/json"
        }
      ];

      return { resourceTemplates };
    } catch (error) {
      console.error("Error listing resource templates:", error);
      return { resourceTemplates: [] };
    }
  };

  return {
    listResources,
    listResourceTemplates,
    readResource
  };
}
