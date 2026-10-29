/**
 * Port of the TurnCreationResult record. util/ChatCreationHelper already returns this shape with
 * graph-shaped turns (ChatTurnGraph: turn + inputs + modelResponse graph + inferenceStatus), so it
 * is re-exported here. The importers attach the owning (not yet saved) Chat alongside.
 */
export type { TurnCreationResult, ChatTurnGraph, ModelResponseGraph, ScoreGraph } from "../../../util/ChatCreationHelper";
