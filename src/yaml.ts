import { Ajv } from "ajv";
import * as yaml from "js-yaml";
export { getYamlTemplate, listYamlTemplateTypes } from "./templates.js";

const ajv = new Ajv({ allErrors: true });

let schemaPromise: Promise<object> | null = null;
/**
 * Fetch and cache the official Codemagic JSON schema.
 * The schema is fetched once and reused for subsequent validations.
 */
async function getSchema(): Promise<object> {
  if (!schemaPromise) {
    schemaPromise = fetch("https://codemagic.io/codemagic-schema.json").then(async response => {
      if (!response.ok) {
        throw new Error(`Failed to fetch schema: ${response.status} ${response.statusText}`);
      }
      return response.json() as Promise<object>;
    });
  }
  return schemaPromise;
}

/** Reset the schema cache — for use in tests only. */
export function _resetSchemaCache(): void {
  schemaPromise = null;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
/**
 * Validate a codemagic.yaml string against the official Codemagic JSON schema.
 * The schema is fetched from codemagic.io on first call and cached for subsequent calls.
 * @param yamlContent - Full contents of a codemagic.yaml file.
 * @returns Validation result with a list of error messages if invalid.
 */
export async function validateCodemagicYaml(yamlContent: string): Promise<ValidationResult> {
  let parsed: unknown;
  try {
    parsed = yaml.load(yamlContent);
  } catch (e) {
    return {
      valid: false,
      errors: [`YAML syntax error: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  const schemaObj = await getSchema();
  const validate = ajv.compile(schemaObj);
  const valid = validate(parsed) as boolean;

  return {
    valid,
    errors: valid ? [] : (validate.errors ?? []).map(e => `${e.instancePath} ${e.message ?? ""}`.trim()),
  };
}