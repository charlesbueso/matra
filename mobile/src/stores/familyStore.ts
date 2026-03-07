// ============================================================
// MATRA — Family Store (Zustand)
// ============================================================

import { create } from 'zustand';
import i18next from 'i18next';
import { supabase, invokeFunction } from '../services/supabase';
import { invalidateSignedUrl } from '../services/signedUrl';
import { useAuthStore } from './authStore';
import { useNotificationStore } from './notificationStore';
import { trackEvent, captureError, AnalyticsEvents } from '../services/analytics';

export interface Person {
  id: string;
  family_group_id: string;
  first_name: string;
  last_name: string | null;
  nickname: string | null;
  birth_date: string | null;
  death_date: string | null;
  birth_place: string | null;
  current_location: string | null;
  avatar_url: string | null;
  ai_biography: string | null;
  ai_summary: string | null;
  graph_x: number | null;
  graph_y: number | null;
  metadata: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  ai_biography_generated_at: string | null;
}

export interface Relationship {
  id: string;
  person_a_id: string;
  person_b_id: string;
  relationship_type: string;
  confidence: number;
  verified: boolean;
  created_at: string;
}

export interface Interview {
  id: string;
  family_group_id: string;
  title: string | null;
  status: string;
  ai_summary: string | null;
  ai_key_topics: string[] | null;
  audio_duration_seconds: number | null;
  audio_size_bytes: number | null;
  audio_storage_path: string | null;
  subject_person_id: string | null;
  person_id: string | null;
  recorded_at: string | null;
  duration_seconds: number | null;
  created_at: string;
}

export interface AudioSnippet {
  label: string;
  quote: string;
  startMs: number;
  endMs: number;
}

export interface Story {
  id: string;
  family_group_id: string;
  interview_id: string | null;
  title: string;
  content: string;
  ai_generated: boolean;
  event_date: string | null;
  event_location: string | null;
  time_period: string | null;
  metadata: { audioSnippets?: AudioSnippet[] } | null;
  created_at: string;
}

export interface FamilyGroup {
  id: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  created_at: string;
}

export interface BackgroundJob {
  id: string;
  title: string;
  status: 'processing' | 'completed' | 'failed';
  interviewId: string | null;
  error: string | null;
  processingStage: 'uploading' | 'transcribing' | 'extracting' | 'summarizing' | 'completed' | null;
}

interface FamilyState {
  // Data
  familyGroups: FamilyGroup[];
  activeFamilyGroupId: string | null;
  people: Person[];
  relationships: Relationship[];
  interviews: Interview[];
  stories: Story[];
  mediaStorageBytes: number;

  // Loading states
  isLoading: boolean;
  isProcessingInterview: boolean;
  processingInterviewId: string | null;
  processingError: string | null;
  backgroundJobs: BackgroundJob[];

  // Actions
  fetchFamilyGroups: () => Promise<void>;
  createFamilyGroup: (name: string, description?: string) => Promise<FamilyGroup>;
  updateFamilyGroup: (id: string, updates: Partial<Pick<FamilyGroup, 'name' | 'description' | 'cover_image_url'>>) => Promise<void>;
  setActiveFamilyGroup: (id: string) => void;
  fetchPeople: () => Promise<void>;
  fetchRelationships: () => Promise<void>;
  fetchInterviews: () => Promise<void>;
  fetchStories: () => Promise<void>;
  fetchMediaStorage: () => Promise<void>;
  fetchAllFamilyData: () => Promise<void>;

  // Person actions
  createPerson: (person: Partial<Person>) => Promise<Person>;
  updatePerson: (id: string, updates: Partial<Person>) => Promise<void>;
  deletePerson: (id: string) => Promise<void>;
  mergePeople: (keepId: string, mergeId: string) => Promise<void>;
  renamePerson: (id: string, newFirstName: string, newLastName: string | null) => Promise<void>;

  // Relationship actions
  verifyRelationship: (id: string) => Promise<void>;
  updateRelationship: (id: string, updates: { relationship_type?: string; verified?: boolean }) => Promise<void>;
  createRelationship: (personAId: string, personBId: string, relationshipType: string) => Promise<void>;
  deleteRelationship: (id: string) => Promise<void>;

  // Interview actions
  processInterview: (audioUri: string | null, familyGroupId: string, title?: string, devTranscript?: string, subjectPersonId?: string) => Promise<any>;
  processInterviewInBackground: (audioUri: string | null, familyGroupId: string, title?: string, devTranscript?: string, subjectPersonId?: string) => void;
  dismissJob: (jobId: string) => void;
  deleteInterview: (id: string) => Promise<void>;
  deleteAllInterviews: () => Promise<void>;

  // Avatar
  uploadPersonAvatar: (personId: string, imageUri: string) => Promise<string>;

  // Biography
  generateBiography: (personId: string) => Promise<string>;
}

export const useFamilyStore = create<FamilyState>((set, get) => ({
  familyGroups: [],
  activeFamilyGroupId: null,
  people: [],
  relationships: [],
  interviews: [],
  stories: [],
  mediaStorageBytes: 0,
  isLoading: false,
  isProcessingInterview: false,
  processingInterviewId: null,
  processingError: null,
  backgroundJobs: [],

  fetchFamilyGroups: async () => {
    const { data, error } = await supabase
      .from('family_groups')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (!error && data) {
      set({ familyGroups: data });
      // Auto-select first if none selected
      if (!get().activeFamilyGroupId && data.length > 0) {
        set({ activeFamilyGroupId: data[0].id });
      }
    }
  },

  createFamilyGroup: async (name, description) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Not authenticated');

    // Insert without .select() — the SELECT RLS policy requires membership,
    // which is only created by a trigger AFTER the insert completes.
    const { error: insertError } = await supabase
      .from('family_groups')
      .insert({ name, description, created_by: session.user.id });

    if (insertError) throw insertError;

    // Now the trigger has fired and we're a member — fetch the new group
    const { data, error: fetchError } = await supabase
      .from('family_groups')
      .select()
      .eq('created_by', session.user.id)
      .eq('name', name)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (fetchError) throw fetchError;
    
    set((state) => ({
      familyGroups: [data, ...state.familyGroups],
      activeFamilyGroupId: data.id,
    }));

    return data;
  },

  updateFamilyGroup: async (id, updates) => {
    const { error } = await supabase
      .from('family_groups')
      .update(updates)
      .eq('id', id);

    if (error) throw error;

    set((state) => ({
      familyGroups: state.familyGroups.map((g) =>
        g.id === id ? { ...g, ...updates } : g
      ),
    }));
  },

  setActiveFamilyGroup: (id) => {
    set({ activeFamilyGroupId: id });
    get().fetchAllFamilyData();
  },

  fetchPeople: async () => {
    const groupId = get().activeFamilyGroupId;
    if (!groupId) return;

    const { data, error } = await supabase
      .from('people')
      .select('*')
      .eq('family_group_id', groupId)
      .is('deleted_at', null)
      .order('first_name');

    if (!error && data) set({ people: data });
  },

  fetchRelationships: async () => {
    const groupId = get().activeFamilyGroupId;
    if (!groupId) return;

    const { data, error } = await supabase
      .from('relationships')
      .select('*')
      .eq('family_group_id', groupId);

    if (!error && data) set({ relationships: data });
  },

  fetchInterviews: async () => {
    const groupId = get().activeFamilyGroupId;
    if (!groupId) return;

    const { data, error } = await supabase
      .from('interviews')
      .select('*')
      .eq('family_group_id', groupId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (!error && data) set({ interviews: data });
  },

  fetchStories: async () => {
    const groupId = get().activeFamilyGroupId;
    if (!groupId) return;

    const { data, error } = await supabase
      .from('stories')
      .select('*')
      .eq('family_group_id', groupId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (!error && data) set({ stories: data });
  },

  fetchMediaStorage: async () => {
    const groupId = get().activeFamilyGroupId;
    if (!groupId) return;

    const { data } = await supabase
      .from('media_assets')
      .select('file_size_bytes')
      .eq('family_group_id', groupId);

    if (data) {
      set({ mediaStorageBytes: data.reduce((sum, r) => sum + (r.file_size_bytes || 0), 0) });
    }
  },

  fetchAllFamilyData: async () => {
    set({ isLoading: true });
    try {
      await Promise.all([
        get().fetchPeople(),
        get().fetchRelationships(),
        get().fetchInterviews(),
        get().fetchStories(),
        get().fetchMediaStorage(),
      ]);
      // Update unread badge counts
      const { people, stories, relationships } = get();
      useNotificationStore.getState().updateUnreadCounts(stories.length, people.length, relationships.length);
    } finally {
      set({ isLoading: false });
    }
  },

  createPerson: async (person) => {
    const groupId = get().activeFamilyGroupId;
    if (!groupId) throw new Error('No active family group');

    const userId = (await supabase.auth.getUser()).data.user!.id;

    const { data, error } = await supabase
      .from('people')
      .insert({
        ...person,
        family_group_id: groupId,
        created_by: userId,
      })
      .select()
      .single();

    if (error) throw error;

    set((state) => ({ people: [...state.people, data] }));
    return data;
  },

  updatePerson: async (id, updates) => {
    const { error } = await supabase
      .from('people')
      .update(updates)
      .eq('id', id);

    if (error) throw error;

    set((state) => ({
      people: state.people.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    }));
  },

  deletePerson: async (id) => {
    const { error } = await supabase
      .from('people')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;

    set((state) => ({
      people: state.people.filter((p) => p.id !== id),
      relationships: state.relationships.filter(
        (r) => r.person_a_id !== id && r.person_b_id !== id
      ),
    }));
  },

  mergePeople: async (keepId, mergeId) => {
    const keep = get().people.find((p) => p.id === keepId);
    const merge = get().people.find((p) => p.id === mergeId);
    if (!keep || !merge) throw new Error('Person not found');

    // 1. Merge person fields: fill in blanks on keep from merge
    const updates: Partial<Person> = {};
    if (!keep.last_name && merge.last_name) updates.last_name = merge.last_name;
    if (!keep.nickname && merge.nickname) updates.nickname = merge.nickname;
    if (!keep.birth_date && merge.birth_date) updates.birth_date = merge.birth_date;
    if (!keep.death_date && merge.death_date) updates.death_date = merge.death_date;
    if (!keep.birth_place && merge.birth_place) updates.birth_place = merge.birth_place;
    if (!keep.current_location && merge.current_location) updates.current_location = merge.current_location;
    if (!keep.avatar_url && merge.avatar_url) updates.avatar_url = merge.avatar_url;
    if (!keep.ai_biography && merge.ai_biography) updates.ai_biography = merge.ai_biography;
    if (!keep.ai_summary && merge.ai_summary) updates.ai_summary = merge.ai_summary;

    // Merge metadata (keep takes priority)
    const mergedMeta = { ...(merge.metadata || {}), ...(keep.metadata || {}) };
    if (Object.keys(mergedMeta).length > 0) updates.metadata = mergedMeta;

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from('people').update(updates).eq('id', keepId);
      if (error) throw error;
    }

    // 2. Re-point relationships from merge → keep (skip duplicates / self-refs)
    const allRels = get().relationships;
    const mergeRels = allRels.filter(
      (r) => r.person_a_id === mergeId || r.person_b_id === mergeId
    );

    for (const rel of mergeRels) {
      const newA = rel.person_a_id === mergeId ? keepId : rel.person_a_id;
      const newB = rel.person_b_id === mergeId ? keepId : rel.person_b_id;

      // Skip self-references (keep ↔ merge were connected)
      if (newA === newB) {
        await supabase.from('relationships').delete().eq('id', rel.id);
        continue;
      }

      // Check if keep already has a relationship with the same person & type
      const duplicate = allRels.some(
        (r) => r.id !== rel.id &&
          ((r.person_a_id === newA && r.person_b_id === newB) ||
           (r.person_a_id === newB && r.person_b_id === newA)) &&
          r.relationship_type === rel.relationship_type
      );

      if (duplicate) {
        await supabase.from('relationships').delete().eq('id', rel.id);
      } else {
        await supabase.from('relationships')
          .update({ person_a_id: newA, person_b_id: newB })
          .eq('id', rel.id);
      }
    }

    // 3. Re-point interviews subject_person_id
    await supabase
      .from('interviews')
      .update({ subject_person_id: keepId })
      .eq('subject_person_id', mergeId);

    // 4. Re-point story_people (delete if duplicate pair exists)
    const { data: mergeStoryPeople } = await supabase
      .from('story_people')
      .select('story_id, person_id')
      .eq('person_id', mergeId);

    if (mergeStoryPeople && mergeStoryPeople.length > 0) {
      const { data: keepStoryPeople } = await supabase
        .from('story_people')
        .select('story_id')
        .eq('person_id', keepId);

      const keepStoryIds = new Set((keepStoryPeople || []).map((sp: any) => sp.story_id));

      for (const sp of mergeStoryPeople) {
        if (keepStoryIds.has(sp.story_id)) {
          // Keep already linked to this story – remove duplicate
          await supabase
            .from('story_people')
            .delete()
            .eq('story_id', sp.story_id)
            .eq('person_id', mergeId);
        } else {
          await supabase
            .from('story_people')
            .update({ person_id: keepId })
            .eq('story_id', sp.story_id)
            .eq('person_id', mergeId);
        }
      }
    }

    // 5. Re-point media_assets
    await supabase
      .from('media_assets')
      .update({ person_id: keepId })
      .eq('person_id', mergeId);

    // 6. Soft-delete the merged person
    await supabase
      .from('people')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', mergeId);

    // 7. Refresh all data
    await get().fetchAllFamilyData();
  },

  renamePerson: async (id, newFirstName, newLastName) => {
    const person = get().people.find((p) => p.id === id);
    if (!person) throw new Error('Person not found');

    const oldFullName = [person.first_name, person.last_name].filter(Boolean).join(' ');
    const newFullName = [newFirstName, newLastName].filter(Boolean).join(' ');
    const oldFirstName = person.first_name;

    // 1. Update the person record
    const { error } = await supabase
      .from('people')
      .update({ first_name: newFirstName, last_name: newLastName })
      .eq('id', id);

    if (error) throw error;

    // 2. Update all story content that mentions this person's name
    const groupId = get().activeFamilyGroupId;
    if (groupId) {
      const { data: stories } = await supabase
        .from('stories')
        .select('id, title, content')
        .eq('family_group_id', groupId)
        .is('deleted_at', null);

      if (stories) {
        for (const story of stories) {
          let updatedTitle = story.title;
          let updatedContent = story.content;
          let changed = false;

          // Replace full name first, then first name only (to avoid partial matches)
          if (oldFullName !== oldFirstName && oldFullName.length > 0) {
            if (updatedTitle.includes(oldFullName)) {
              updatedTitle = updatedTitle.split(oldFullName).join(newFullName);
              changed = true;
            }
            if (updatedContent.includes(oldFullName)) {
              updatedContent = updatedContent.split(oldFullName).join(newFullName);
              changed = true;
            }
          }
          if (updatedTitle.includes(oldFirstName)) {
            updatedTitle = updatedTitle.split(oldFirstName).join(newFirstName);
            changed = true;
          }
          if (updatedContent.includes(oldFirstName)) {
            updatedContent = updatedContent.split(oldFirstName).join(newFirstName);
            changed = true;
          }

          if (changed) {
            await supabase
              .from('stories')
              .update({ title: updatedTitle, content: updatedContent })
              .eq('id', story.id);
          }
        }
      }

      // 3. Update interview summaries that mention this person
      const { data: interviews } = await supabase
        .from('interviews')
        .select('id, ai_summary')
        .eq('family_group_id', groupId)
        .is('deleted_at', null)
        .not('ai_summary', 'is', null);

      if (interviews) {
        for (const interview of interviews) {
          let updatedSummary = interview.ai_summary;
          let changed = false;

          if (oldFullName !== oldFirstName && oldFullName.length > 0 && updatedSummary.includes(oldFullName)) {
            updatedSummary = updatedSummary.split(oldFullName).join(newFullName);
            changed = true;
          }
          if (updatedSummary.includes(oldFirstName)) {
            updatedSummary = updatedSummary.split(oldFirstName).join(newFirstName);
            changed = true;
          }

          if (changed) {
            await supabase
              .from('interviews')
              .update({ ai_summary: updatedSummary })
              .eq('id', interview.id);
          }
        }
      }

      // 4. Update biography if exists
      if (person.ai_biography) {
        let updatedBio = person.ai_biography;
        if (oldFullName !== oldFirstName && oldFullName.length > 0) {
          updatedBio = updatedBio.split(oldFullName).join(newFullName);
        }
        updatedBio = updatedBio.split(oldFirstName).join(newFirstName);
        if (updatedBio !== person.ai_biography) {
          await supabase
            .from('people')
            .update({ ai_biography: updatedBio })
            .eq('id', id);
        }
      }
    }

    // 5. Refresh all data to get consistent state
    await get().fetchAllFamilyData();
  },

  verifyRelationship: async (id) => {
    const { error } = await supabase
      .from('relationships')
      .update({ verified: true })
      .eq('id', id);

    if (error) throw error;

    set((state) => ({
      relationships: state.relationships.map((r) =>
        r.id === id ? { ...r, verified: true } : r
      ),
    }));
  },

  updateRelationship: async (id, updates) => {
    const { error } = await supabase
      .from('relationships')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;

    set((state) => ({
      relationships: state.relationships.map((r) =>
        r.id === id ? { ...r, ...updates } : r
      ),
    }));
  },

  createRelationship: async (personAId, personBId, relationshipType) => {
    const groupId = get().activeFamilyGroupId;
    if (!groupId) throw new Error('No active family group');

    const { data, error } = await supabase
      .from('relationships')
      .upsert({
        family_group_id: groupId,
        person_a_id: personAId,
        person_b_id: personBId,
        relationship_type: relationshipType,
        verified: true,
        confidence: 1.0,
      }, { onConflict: 'person_a_id,person_b_id,relationship_type' })
      .select()
      .single();

    if (error) throw error;

    // Clear any prior rejection for this pair so it won't be blocked
    await supabase.from('rejected_relationships')
      .delete()
      .eq('family_group_id', groupId)
      .eq('person_a_id', personAId)
      .eq('person_b_id', personBId)
      .eq('relationship_type', relationshipType);

    set((state) => ({
      relationships: state.relationships
        .filter((r) => r.id !== data.id)
        .concat(data),
    }));
  },

  deleteRelationship: async (id) => {
    // Find the relationship being deleted so we can remove its inverse too
    const rel = get().relationships.find((r) => r.id === id);
    const groupId = get().activeFamilyGroupId;
    const userId = useAuthStore.getState().profile?.id;

    const { error } = await supabase
      .from('relationships')
      .delete()
      .eq('id', id);

    if (error) throw error;

    const removedIds = new Set<string>([id]);

    // Record this as a user-rejected relationship so AI inference won't recreate it
    if (rel && groupId && userId) {
      await supabase.from('rejected_relationships').upsert({
        family_group_id: groupId,
        person_a_id: rel.person_a_id,
        person_b_id: rel.person_b_id,
        relationship_type: rel.relationship_type,
        rejected_by: userId,
      }, { onConflict: 'family_group_id,person_a_id,person_b_id,relationship_type' });
    }

    // Also delete the inverse/symmetric counterpart — query the DATABASE
    // directly instead of the local store, which may be out of sync.
    if (rel) {
      const inverseType: Record<string, string> = {
        parent: 'child', child: 'parent',
        grandparent: 'grandchild', grandchild: 'grandparent',
        great_grandparent: 'great_grandchild', great_grandchild: 'great_grandparent',
        great_great_grandparent: 'great_great_grandchild', great_great_grandchild: 'great_great_grandparent',
        uncle_aunt: 'nephew_niece', nephew_niece: 'uncle_aunt',
        step_parent: 'step_child', step_child: 'step_parent',
        parent_in_law: 'child_in_law', child_in_law: 'parent_in_law',
        adopted_parent: 'adopted_child', adopted_child: 'adopted_parent',
        godparent: 'godchild', godchild: 'godparent',
      };
      const symmetricTypes = ['spouse', 'ex_spouse', 'sibling', 'half_sibling', 'step_sibling', 'cousin', 'in_law', 'other'];
      const counterType = inverseType[rel.relationship_type] ||
        (symmetricTypes.includes(rel.relationship_type) ? rel.relationship_type : null);

      if (counterType) {
        // Query DB for the inverse relationship
        const { data: counterRows } = await supabase
          .from('relationships')
          .select('id')
          .eq('person_a_id', rel.person_b_id)
          .eq('person_b_id', rel.person_a_id)
          .eq('relationship_type', counterType);

        if (counterRows && counterRows.length > 0) {
          const counterIds = counterRows.map((r) => r.id);
          await supabase
            .from('relationships')
            .delete()
            .in('id', counterIds);
          counterIds.forEach((cid) => removedIds.add(cid));
        }

        // Also reject the inverse direction
        if (groupId && userId) {
          await supabase.from('rejected_relationships').upsert({
            family_group_id: groupId,
            person_a_id: rel.person_b_id,
            person_b_id: rel.person_a_id,
            relationship_type: counterType,
            rejected_by: userId,
          }, { onConflict: 'family_group_id,person_a_id,person_b_id,relationship_type' });
        }
      }
    }

    set((state) => ({
      relationships: state.relationships.filter((r) => !removedIds.has(r.id)),
    }));
  },

  processInterview: async (audioUri, familyGroupId, title, devTranscript, subjectPersonId) => {
    const formData = new FormData();
    
    if (devTranscript) {
      // Dev mode: send transcript text directly, skip audio
      formData.append('transcript', devTranscript);
    } else if (audioUri) {
      // React Native requires URI-based file objects for FormData uploads.
      // Blob-based uploads are unreliable and often send empty/malformed bodies.
      formData.append('audio', {
        uri: audioUri,
        type: 'audio/m4a',
        name: 'interview.m4a',
      } as any);
    }
    formData.append('familyGroupId', familyGroupId);
    if (title) formData.append('title', title);
    if (subjectPersonId) formData.append('subjectPersonId', subjectPersonId);
    const language = useAuthStore.getState().profile?.preferences?.language;
    if (language) formData.append('language', language);

    const result = await invokeFunction('process-interview', undefined, { formData });

    trackEvent(AnalyticsEvents.INTERVIEW_PROCESSING_COMPLETED);

    // Refresh all data after processing
    await get().fetchAllFamilyData();

    return result;
  },

  processInterviewInBackground: (audioUri, familyGroupId, title, devTranscript, subjectPersonId) => {
    const jobId = Date.now().toString();
    const jobTitle = title || 'Conversation';
    const newJob: BackgroundJob = { id: jobId, title: jobTitle, status: 'processing', interviewId: null, error: null, processingStage: 'uploading' };
    set((state) => ({
      backgroundJobs: [...state.backgroundJobs, newJob],
      isProcessingInterview: true,
      processingInterviewId: null,
      processingError: null,
    }));
    trackEvent(AnalyticsEvents.INTERVIEW_PROCESSING_STARTED, { title: jobTitle });

    // Poll the DB for real-time processing stage updates
    const userId = useAuthStore.getState().session?.user?.id;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    if (userId) {
      pollInterval = setInterval(async () => {
        try {
          const { data } = await supabase
            .from('interviews')
            .select('id, status, processing_stage')
            .eq('conducted_by', userId)
            .in('status', ['uploading', 'transcribing', 'processing'])
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          if (data) {
            // Map DB state to UI stage: processing_stage may be null during upload
            const stage = data.processing_stage || (data.status === 'uploading' ? 'uploading' : 'transcribing');
            set((state) => ({
              backgroundJobs: state.backgroundJobs.map((j) =>
                j.id === jobId ? { ...j, processingStage: stage, interviewId: data.id } : j
              ),
            }));
          }
        } catch (_) { /* ignore poll errors */ }
      }, 2000);
    }

    get()
      .processInterview(audioUri, familyGroupId, title, devTranscript, subjectPersonId)
      .then((result) => {
        const interviewId = result?.interview?.id || null;
        set((state) => ({
          backgroundJobs: state.backgroundJobs.map((j) =>
            j.id === jobId ? { ...j, status: 'completed' as const, interviewId } : j
          ),
          processingInterviewId: interviewId,
        }));
        useNotificationStore.getState().sendLocalNotification(
          i18next.t('notifications.lineageReady'),
          i18next.t('notifications.lineageReadyBody'),
        );
      })
      .catch((err) => {
        trackEvent(AnalyticsEvents.INTERVIEW_PROCESSING_FAILED, { error: err?.message });
        captureError(err instanceof Error ? err : new Error(err?.message || 'Interview processing failed'));
        set((state) => ({
          backgroundJobs: state.backgroundJobs.map((j) =>
            j.id === jobId ? { ...j, status: 'failed' as const, error: err?.message || 'Processing failed' } : j
          ),
          processingError: err?.message || 'Processing failed. Please try again.',
        }));
        useNotificationStore.getState().sendLocalNotification(
          i18next.t('notifications.processingFailed'),
          i18next.t('notifications.processingFailedBody'),
        );
      })
      .finally(() => {
        if (pollInterval) clearInterval(pollInterval);
        // isProcessingInterview is true if any job is still processing
        const stillProcessing = get().backgroundJobs.some((j) => j.id !== jobId && j.status === 'processing');
        set({ isProcessingInterview: stillProcessing });
      });
  },

  dismissJob: (jobId) => {
    set((state) => ({
      backgroundJobs: state.backgroundJobs.filter((j) => j.id !== jobId),
    }));
  },

  deleteInterview: async (id) => {
    const now = new Date().toISOString();
    const interview = get().interviews.find((i) => i.id === id);
    const groupId = interview?.family_group_id || get().activeFamilyGroupId;
    const selfPersonId = useAuthStore.getState().profile?.self_person_id;

    // 1. Hard-delete ALL relationships sourced from this interview
    const { error: relDeleteError } = await supabase
      .from('relationships')
      .delete()
      .eq('source_interview_id', id);

    if (relDeleteError) {
      captureError(new Error(`Failed to delete relationships for interview ${id}: ${relDeleteError.message}`));
      throw new Error('Failed to delete interview relationships');
    }

    // 2. Soft-delete stories from this interview
    await supabase
      .from('stories')
      .update({ deleted_at: now })
      .eq('interview_id', id)
      .is('deleted_at', null);

    // 3. Find orphaned people: query DB for all remaining relationships
    //    to determine which people are still referenced
    const { data: remainingRels } = await supabase
      .from('relationships')
      .select('person_a_id, person_b_id')
      .eq('family_group_id', groupId || '');

    const referencedPersonIds = new Set<string>();
    for (const r of (remainingRels || [])) {
      referencedPersonIds.add(r.person_a_id);
      referencedPersonIds.add(r.person_b_id);
    }
    // Self-person is always protected
    if (selfPersonId) referencedPersonIds.add(selfPersonId);

    // Get all non-deleted people from DB (not store)
    const { data: dbPeople } = await supabase
      .from('people')
      .select('id, avatar_url')
      .eq('family_group_id', groupId || '')
      .is('deleted_at', null);

    const orphanedPeople = (dbPeople || []).filter(
      (p) => !referencedPersonIds.has(p.id)
    );

    // 4. Clean up orphaned people
    if (orphanedPeople.length > 0) {
      const orphanIds = orphanedPeople.map((p) => p.id);

      // Clean up avatar images from DO Spaces
      const avatarPersonIds = orphanedPeople
        .filter((p) => p.avatar_url)
        .map((p) => p.id);
      if (avatarPersonIds.length > 0) {
        try {
          await invokeFunction('cleanup-person-avatars', { personIds: avatarPersonIds });
        } catch {
          // Best-effort
        }
      }

      // Soft-delete orphaned people
      await supabase
        .from('people')
        .update({ deleted_at: now })
        .in('id', orphanIds);

      // Hard-delete any stale relationships still referencing orphaned people
      // (catches relationships where source_interview_id was overwritten by a later interview)
      for (const pid of orphanIds) {
        await supabase
          .from('relationships')
          .delete()
          .or(`person_a_id.eq.${pid},person_b_id.eq.${pid}`);
      }
    }

    // 5. Soft-delete the interview itself
    const { error } = await supabase
      .from('interviews')
      .update({ deleted_at: now })
      .eq('id', id);

    if (error) throw error;

    trackEvent(AnalyticsEvents.INTERVIEW_DELETED);

    // Refresh all data to get consistent state
    await get().fetchAllFamilyData();
  },

  deleteAllInterviews: async () => {
    const groupId = get().activeFamilyGroupId;
    if (!groupId) return;
    const now = new Date().toISOString();
    const selfPersonId = useAuthStore.getState().profile?.self_person_id;

    // 1. Hard-delete ALL relationships in this family group
    await supabase
      .from('relationships')
      .delete()
      .eq('family_group_id', groupId);

    // 2. Get ALL non-deleted people from DB (not store) for avatar cleanup
    const { data: dbPeople } = await supabase
      .from('people')
      .select('id, avatar_url')
      .eq('family_group_id', groupId)
      .is('deleted_at', null);

    const peopleToDelete = (dbPeople || []).filter((p) => p.id !== selfPersonId);

    // 3. Clean up avatar images from DO Spaces
    const avatarPersonIds = peopleToDelete
      .filter((p) => p.avatar_url)
      .map((p) => p.id);
    if (avatarPersonIds.length > 0) {
      try {
        await invokeFunction('cleanup-person-avatars', { personIds: avatarPersonIds });
      } catch {
        // Best-effort: don't block deletion if cleanup fails
      }
    }

    // 4. Soft-delete ALL people except self-person
    let peopleQuery = supabase
      .from('people')
      .update({ deleted_at: now })
      .eq('family_group_id', groupId)
      .is('deleted_at', null);
    if (selfPersonId) {
      peopleQuery = peopleQuery.neq('id', selfPersonId);
    }
    await peopleQuery;

    // 5. Soft-delete ALL stories in this family group
    await supabase
      .from('stories')
      .update({ deleted_at: now })
      .eq('family_group_id', groupId)
      .is('deleted_at', null);

    // 6. Soft-delete ALL interviews in this family group
    const { error } = await supabase
      .from('interviews')
      .update({ deleted_at: now })
      .eq('family_group_id', groupId)
      .is('deleted_at', null);

    if (error) throw error;

    // Refresh all data to get consistent state
    await get().fetchAllFamilyData();
  },

  uploadPersonAvatar: async (personId, imageUri) => {
    // Invalidate the old signed URL cache entry before uploading
    const oldKey = get().people.find((p) => p.id === personId)?.avatar_url;
    if (oldKey) invalidateSignedUrl(oldKey);

    const formData = new FormData();
    // React Native FormData needs {uri, type, name} — not a Blob
    formData.append('image', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'avatar.jpg',
    } as any);
    formData.append('personId', personId);

    const result = await invokeFunction<{ avatar_url: string }>(
      'upload-person-avatar',
      undefined,
      { formData }
    );

    set((state) => ({
      people: state.people.map((p) =>
        p.id === personId ? { ...p, avatar_url: result.avatar_url } : p
      ),
    }));

    return result.avatar_url;
  },

  generateBiography: async (personId) => {
    const language = useAuthStore.getState().profile?.preferences?.language;
    const result = await invokeFunction<{ biography: string }>('generate-biography', { personId, language });
    trackEvent(AnalyticsEvents.BIOGRAPHY_GENERATED);
    
    // Update local state with biography and generation timestamp
    const now = new Date().toISOString();
    set((state) => ({
      people: state.people.map((p) =>
        p.id === personId ? { ...p, ai_biography: result.biography, ai_biography_generated_at: now } : p
      ),
    }));

    return result.biography;
  },
}));
