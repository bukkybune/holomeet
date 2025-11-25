import { and, eq, not } from "drizzle-orm";
import { NextResponse, NextRequest } from "next/server";
import { db } from "@/db";
import {
    CallEndedEvent,
    CallTranscriptionReadyEvent,
    CallSessionParticipantLeftEvent,
    CallRecordingReadyEvent,
    CallSessionStartedEvent,
} from "@stream-io/node-sdk";
import{ agents, meetings } from "@/db/schema";
import { streamVideo } from "@/lib/stream-video";
import { inngest } from "@/inngest/client";

// Store active realtime clients so they don't get garbage collected
const activeRealtimeClients = new Map<string, any>();

function verifySignatureWithSDK(body: string, signature: string ): boolean {
    return streamVideo.verifyWebhook(body, signature);
}

export async function POST(req: NextRequest) {
    const signature = req.headers.get("x-signature");
    const apiKey = req.headers.get("x-api-key");

    if (!signature || !apiKey) {
        return NextResponse.json({ error: "Missing signature or API key" }, { status: 400 });
    }

    const body = await req.text();
    
    if (!verifySignatureWithSDK(body, signature)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let payload: unknown;
    try {
        payload = JSON.parse(body) as Record<string, any>;
    } catch (error) {
        return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const eventType = (payload as Record<string, unknown>)?.type;
    
    if (eventType === "call.session_started") {
        console.log("🎬 CALL SESSION STARTED EVENT RECEIVED");
        const event = payload as CallSessionStartedEvent;
        const meetingId = event.call.custom?.meetingId;
        
        console.log("Meeting ID from event:", meetingId);

        if(!meetingId) {
            console.log("❌ No meeting ID found");
            return NextResponse.json({ error: "Missing meeting ID in call custom data" }, { status: 400 });
        }

        try {
            const [existingMeeting] = await db
                .select()
                .from(meetings)
                .where(
                    and(
                        eq(meetings.id, meetingId),
                        not(eq(meetings.status, "completed")),
                        not(eq(meetings.status, "active")),
                        not(eq(meetings.status, "cancelled")),
                        not(eq(meetings.status, "processing")),
                    )
                );

            console.log("Meeting found:", !!existingMeeting);

            if (!existingMeeting) {
                console.log("❌ Meeting not found or invalid state");
                return NextResponse.json({ error: "Meeting not found or not in a valid state to start" }, { status: 404 });
            }

            await db
                .update(meetings)
                .set({
                    status: "active",
                    startedAt: new Date(),
                })
                .where(eq(meetings.id, existingMeeting.id));
            
            console.log("✅ Meeting status updated to active");
            
            const [existingAgent] = await db
                .select()
                .from(agents)
                .where(eq(agents.id, existingMeeting.agentId));
            
            console.log("Agent found:", !!existingAgent);
            console.log("Agent userId:", existingAgent?.userId);
            
            if(!existingAgent) {
                console.log("❌ Agent not found");
                return NextResponse.json({ error: "Agent not found for the meeting" }, { status: 404 });
            }

            // Ensure agent user exists in Stream
            console.log("Creating/updating agent user in Stream...");
            await streamVideo.upsertUsers([{
                id: `${existingAgent.userId}_agent_${existingAgent.id}`,
                role: "user",
                name: "AI Agent",
            }]);
            console.log("✅ Agent user upserted");

            const call = streamVideo.video.call("default", meetingId);
            console.log("📞 Call object created");
            
            console.log("🤖 Connecting OpenAI...");
            const realtimeClient = await streamVideo.video.connectOpenAi({
                call,
                openAiApiKey: process.env.OPENAI_API_KEY!,
                agentUserId: `${existingAgent.userId}_agent_${existingAgent.id}`,
            });

            console.log("✅ OpenAI connected successfully!");
            
            await realtimeClient.updateSession({
                instructions: existingAgent.instructions,
                voice: 'alloy',
                turn_detection: { 
                    type: 'server_vad',
                    threshold: 0.5,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 500
                },
                input_audio_transcription: {
                    model: 'whisper-1'
                }
            });
            
            console.log("✅ Session instructions updated");

            // Add event listeners to track agent responses
            realtimeClient.on('conversation.item.created', (event: any) => {
                console.log('💬 Conversation item created:', event.item?.type);
            });

            realtimeClient.on('response.audio.delta', (event: any) => {
                console.log('🔊 Audio delta received');
            });

            realtimeClient.on('response.done', (event: any) => {
                console.log('✅ Agent response complete');
            });

            realtimeClient.on('error', (event: any) => {
                console.error('❌ OpenAI Realtime error:', event);
            });

            // Store the client so it doesn't get garbage collected
            activeRealtimeClients.set(meetingId, realtimeClient);
            console.log(`📦 Stored realtime client for meeting ${meetingId}`);
            console.log(`📊 Active clients: ${activeRealtimeClients.size}`);

        } catch (error) {
            console.error("❌ ERROR in call.session_started:", error);
            return NextResponse.json(
                { 
                    error: "Failed to setup meeting", 
                    details: error instanceof Error ? error.message : "Unknown error" 
                },
                { status: 500 }
            );
        }
    } else if (eventType === "call.session_participant_left") {
        console.log("👋 PARTICIPANT LEFT EVENT");
        const event = payload as CallSessionParticipantLeftEvent;
        const meetingId = event.call_cid.split(":")[1];

        console.log("Participant that left:", JSON.stringify(event.participant));

        if (!meetingId) {
            return NextResponse.json({ error: "Missing meeting ID in call CID" }, { status: 400 });
        }

        const call = streamVideo.video.call("default", meetingId);
        await call.end();
        
    } else if (eventType === "call.session_ended") {
        const event = payload as CallEndedEvent;
        const meetingId = event.call.custom?.meetingId;

        if (!meetingId) {
            return NextResponse.json({ error: "Missing meeting ID in call custom data" }, { status: 400 });
        }

        // Clean up the realtime client
        const client = activeRealtimeClients.get(meetingId);
        if (client) {
            console.log(`🧹 Cleaning up realtime client on call end for ${meetingId}`);
            try {
                await client.disconnect();
            } catch (error) {
                console.error("Error disconnecting client:", error);
            }
            activeRealtimeClients.delete(meetingId);
        }

        await db
            .update(meetings)
            .set({
                status: "processing",
                endedAt: new Date(),
            })
            .where(and(eq(meetings.id, meetingId), eq(meetings.status, "active")));

    } else if (eventType === "call.transcription_ready") {
        const event = payload as CallTranscriptionReadyEvent;
        const meetingId = event.call_cid.split(":")[1];

        const [updatedMeeting] = await db
            .update(meetings)
            .set({
                transcriptUrl: event.call_transcription.url,
            })
            .where(and(eq(meetings.id, meetingId)))
            .returning();

        if (!updatedMeeting) {
            return NextResponse.json({ error: "Meeting not found for transcription update" }, { status: 404 });
        }
        
        await inngest.send({
            name: "meetings/processing",
            data: {
                meetingId: updatedMeeting.id,
                transcriptUrl: updatedMeeting.transcriptUrl,
            },
        });

    } else if (eventType === "call.recording_ready") {
        const event = payload as CallRecordingReadyEvent;
        const meetingId = event.call_cid.split(":")[1];

        await db
            .update(meetings)
            .set({
                recordingUrl: event.call_recording.url,
            })
            .where(and(eq(meetings.id, meetingId)));
    }
    

    return NextResponse.json({ status: "ok" });
}