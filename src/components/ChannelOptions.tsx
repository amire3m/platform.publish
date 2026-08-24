import { CHANNEL_GROUPS } from "@/lib/channels";

export function ChannelOptions() {
  return CHANNEL_GROUPS.map((group) => (
    <optgroup key={group.id} label={group.labelFa}>
      {group.channels.map((channel) => (
        <option key={channel.id} value={channel.id}>{channel.labelFa}</option>
      ))}
    </optgroup>
  ));
}
