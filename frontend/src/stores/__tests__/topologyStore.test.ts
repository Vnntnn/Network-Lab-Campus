import { beforeEach, describe, expect, it } from "vitest";
import type { LabPod } from "@/api/queries";
import { useTopologyStore } from "@/stores/topologyStore";

function makePod(id: number, name = `pod-${id}`): LabPod {
  return {
    id,
    pod_number: id,
    pod_name: name,
    device_ip: `10.0.0.${id}`,
    device_type: "cisco_iosxe",
    description: "",
    ssh_username: "admin",
    ssh_password: "admin",
  };
}

describe("topologyStore syncPods", () => {
  beforeEach(() => {
    useTopologyStore.setState({ nodes: [], edges: [] });
  });

  it("keeps saved node positions when pod metadata refreshes", () => {
    const pod = makePod(1, "edge-a");

    useTopologyStore.getState().syncPods([pod]);

    useTopologyStore.getState().setNodes([
      {
        ...useTopologyStore.getState().nodes[0],
        position: { x: 999, y: 321 },
      },
    ]);

    useTopologyStore.getState().syncPods([{ ...pod, pod_name: "edge-a-renamed" }]);

    const refreshed = useTopologyStore.getState().nodes[0];
    expect(refreshed.position).toEqual({ x: 999, y: 321 });
    expect(refreshed.data.pod.pod_name).toBe("edge-a-renamed");
  });

  it("drops stale nodes when pods are removed from inventory", () => {
    useTopologyStore.getState().syncPods([makePod(1), makePod(2)]);
    expect(useTopologyStore.getState().nodes).toHaveLength(2);

    useTopologyStore.getState().syncPods([makePod(2)]);

    const ids = useTopologyStore.getState().nodes.map((node) => node.id);
    expect(ids).toEqual(["pod-2"]);
  });
});
