// Shared types for Open Lines manager endpoints

export type RegisterConnectorRequest = {
  connector?: string;           // default evolution_whatsapp
  name?: string;                // display name
  chatGroup?: "Y" | "N";      // group chat type
  icon?: any;                   // optional ICON object
  icon_disabled?: any;          // optional ICON_DISABLED object
  placement_handler?: string;   // optional placement handler URL
};

export type DataSetRequest = {
  connector?: string;           // default evolution_whatsapp
  data: Record<string, any>;    // DATA payload for imconnector.connector.data.set
};

export type ActivateConnectorRequest = {
  connector?: string;           // default evolution_whatsapp
  line: string;                 // line id
  active?: boolean;             // true => activate, false => deactivate
};

export type CreateLineRequest = {
  name: string;                 // LINE_NAME
};

export type BindLineRequest = {
  line_id: string;
  wa_instance_id: string;
};

export type LinesResponse = {
  ok: boolean;
  result: any;
};
