import React from "react";
import type { ModalProps } from "@mantine/core";
import { Modal, Stack, Text, ScrollArea, Flex, CloseButton, Button, TextInput } from "@mantine/core";
import useFile from "../../../store/useFile";
import { CodeHighlight } from "@mantine/code-highlight";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);

  const [editMode, setEditMode] = React.useState(false);
  const [edits, setEdits] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    // reset edit mode and populate edits with current primitive fields
    setEditMode(false);
    const initial: Record<string, string> = {};
    (nodeData?.text ?? []).forEach(row => {
      if (row.key && row.type !== "array" && row.type !== "object") {
        initial[row.key] = row.value === null || typeof row.value === "undefined" ? "" : String(row.value);
      }
    });
    setEdits(initial);
  }, [nodeData, opened]);

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <Flex gap="xs" align="center">
              {!editMode ? (
                <>
                  <Button size="xs" color="blue" variant="light" onClick={() => setEditMode(true)} aria-label="Edit node">
                    Edit
                  </Button>
                  <CloseButton onClick={onClose} />
                </>
              ) : (
                <>
                  <Button
                    size="xs"
                    color="green"
                    variant="filled"
                    onClick={() => {
                      try {
                        const raw = useFile.getState().getContents();
                        const obj = JSON.parse(raw);

                        let target: any = obj;
                        if (nodeData?.path && nodeData.path.length) {
                          for (const seg of nodeData.path) target = target[seg as any];
                        }

                        for (const key of Object.keys(edits)) {
                          if (!key) continue;
                          const originalRow = nodeData?.text.find(r => r.key === key);
                          const newValueRaw = edits[key];
                          let newValue: any = newValueRaw;

                          if (originalRow) {
                            if (originalRow.type === "number") {
                              const n = Number(newValueRaw);
                              newValue = Number.isNaN(n) ? newValueRaw : n;
                            } else if (originalRow.type === "boolean") {
                              newValue = newValueRaw === "true";
                            } else if (originalRow.type === "null") {
                              newValue = newValueRaw === "" ? null : newValueRaw;
                            } else {
                              newValue = newValueRaw;
                            }
                          }

                          target[key] = newValue;
                        }

                        const jsonStr = JSON.stringify(obj, null, 2);

                        // Update the graph store immediately so the on-canvas node and modal show the new values
                        try {
                          if (nodeData) {
                            // Build updated text rows from the modified target object
                            const updatedText = (nodeData.text ?? []).map(row => {
                              if (!row.key) return row;
                              const newVal = (target && Object.prototype.hasOwnProperty.call(target, row.key)) ? target[row.key] : row.value;
                              return { ...row, value: newVal };
                            });

                            const g = useGraph.getState();
                            const newNodes = g.nodes.map(n => (n.id === nodeData.id ? { ...n, text: updatedText } : n));
                            useGraph.setState({ nodes: newNodes, selectedNode: { ...nodeData, text: updatedText } });
                          }
                        } catch (e) {
                          // non-fatal
                          console.error(e);
                        }

                        // Update the main editor contents only (single source of truth)
                        useFile.getState().setContents({ contents: jsonStr, hasChanges: true });
                        setEditMode(false);
                      } catch (err) {
                        console.error(err);
                      }
                    }}
                    aria-label="Save edits"
                  >
                    Save
                  </Button>
                  <Button
                    size="xs"
                    color="red"
                    variant="outline"
                    onClick={() => {
                      const reset: Record<string, string> = {};
                      (nodeData?.text ?? []).forEach(row => {
                        if (row.key && row.type !== "array" && row.type !== "object") {
                          reset[row.key] = row.value === null || typeof row.value === "undefined" ? "" : String(row.value);
                        }
                      });
                      setEdits(reset);
                      setEditMode(false);
                    }}
                    aria-label="Cancel edits"
                  >
                    Cancel
                  </Button>
                </>
              )}
            </Flex>
          </Flex>
          <ScrollArea.Autosize mah={250} maw={600}>
            {!editMode ? (
              <CodeHighlight
                code={normalizeNodeData(nodeData?.text ?? [])}
                miw={350}
                maw={600}
                language="json"
                withCopyButton
              />
            ) : (
              <Stack gap="xs">
                {(nodeData?.text ?? [])
                  .filter(row => row.key && row.type !== "array" && row.type !== "object")
                  .map(row => (
                    <Flex key={row.key} align="center" justify="space-between" gap="sm">
                      <Text fz="xs" fw={500} style={{ minWidth: 120 }}>
                        {row.key}
                      </Text>
                      <TextInput
                        value={edits[row.key ?? ""] ?? ""}
                        onChange={e => setEdits(prev => ({ ...prev, [row.key ?? ""]: e.currentTarget.value }))}
                        style={{ flex: 1 }}
                        aria-label={`Edit ${row.key}`}
                      />
                    </Flex>
                  ))}
              </Stack>
            )}
          </ScrollArea.Autosize>
        </Stack>
        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
};
