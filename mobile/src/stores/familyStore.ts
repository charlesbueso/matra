// ============================================================
// MATRA — Family Store (Zustand)
// ============================================================

import { create } from 'zustand';
import { supabase, invokeFunction } from '../services/supabase';
import { useAuthStore } from './authStore';
import { useNotificationStore } from './notificationStore';

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
  created_at: string;
}

export interface Relationship {
  id: string;
  person_a_id: string;
  person_b_id: string;
  relationship_type: string;
  confidence: number;
  verified: boolean;
}

export interface Interview {
  id: string;
  family_group_id: string;
  title: string | null;
  status: string;
  ai_summary: string | null;
  ai_key_topics: string[] | null;
  audio_duration_seconds: number | null;
  subject_person_id: string | null;
  person_id: string | null;
  recorded_at: string | null;
  duration_seconds: number | null;
  created_at: string;
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
  created_at: string;
}

export interface FamilyGroup {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

interface FamilyState {
  // Data
  familyGroups: FamilyGroup[];
  activeFamilyGroupId: string | null;
  people: Person[];
  relationships: Relationship[];
  interviews: Interview[];
  stories: Story[];

  // Loading states
  isLoading: boolean;

  // Actions
  fetchFamilyGroups: () => Promise<void>;
  createFamilyGroup: (name: string, description?: string) => Promise<FamilyGroup>;
  setActiveFamilyGroup: (id: string) => void;
  fetchPeople: () => Promise<void>;
  fetchRelationships: () => Promise<void>;
  fetchInterviews: () => Promise<void>;
  fetchStories: () => Promise<void>;
  fetchAllFamilyData: () => Promise<void>;

  // Person actions
  createPerson: (person: Partial<Person>) => Promise<Person>;
  updatePerson: (id: string, updates: Partial<Person>) => Promise<void>;
  renamePerson: (id: string, newFirstName: string, newLastName: string | null) => Promise<void>;

  // Relationship actions
  verifyRelationship: (id: string) => Promise<void>;
  updateRelationship: (id: string, updates: { relationship_type?: string; verified?: boolean }) => Promise<void>;
  createRelationship: (personAId: string, personBId: string, relationshipType: string) => Promise<void>;
  deleteRelationship: (id: string) => Promise<void>;

  // Interview actions
  processInterview: (audioUri: string | null, familyGroupId: string, title?: string, devTranscript?: string, subjectPersonId?: string) => Promise<any>;
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
  isLoading: false,

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

  fetchAllFamilyData: async () => {
    set({ isLoading: true });
    try {
      await Promise.all([
        get().fetchPeople(),
        get().fetchRelationships(),
        get().fetchInterviews(),
        get().fetchStories(),
      ]);
      // Update unread badge counts
      const { people, stories } = get();
      useNotificationStore.getState().updateUnreadCounts(stories.length, people.length);
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
      .insert({
        family_group_id: groupId,
        person_a_id: personAId,
        person_b_id: personBId,
        relationship_type: relationshipType,
        verified: true,
        confidence: 1.0,
      })
      .select()
      .single();

    if (error) throw error;

    set((state) => ({ relationships: [...state.relationships, data] }));
  },

  deleteRelationship: async (id) => {
    const { error } = await supabase
      .from('relationships')
      .delete()
      .eq('id', id);

    if (error) throw error;

    set((state) => ({
      relationships: state.relationships.filter((r) => r.id !== id),
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

    const result = await invokeFunction('process-interview', undefined, { formData });

    // Refresh all data after processing
    await get().fetchAllFamilyData();

    return result;
  },

  deleteInterview: async (id) => {
    const now = new Date().toISOString();

    // Soft-delete stories from this interview
    await supabase
      .from('stories')
      .update({ deleted_at: now })
      .eq('interview_id', id)
      .is('deleted_at', null);

    // Collect ALL people associated with this interview:
    // 1) People linked via story_people
    const { data: interviewStoryPeople } = await supabase
      .from('story_people')
      .select('person_id, stories!inner(id, interview_id, deleted_at)')
      .eq('stories.interview_id', id);

    const personIdsFromInterview = new Set(
      (interviewStoryPeople || []).map((sp: any) => sp.person_id)
    );

    // 2) The subject person of the interview
    const interview = get().interviews.find((i) => i.id === id);
    if (interview?.subject_person_id) {
      personIdsFromInterview.add(interview.subject_person_id);
    }

    // Never delete the user's self person
    const selfPersonId = useAuthStore.getState().profile?.self_person_id;
    const personIdsToDelete = [...personIdsFromInterview].filter(
      (pid) => pid !== selfPersonId
    );

    // Soft-delete all people from this conversation and remove their relationships
    if (personIdsToDelete.length > 0) {
      // Clean up avatar images from DO Spaces before soft-deleting
      try {
        await invokeFunction('cleanup-person-avatars', { personIds: personIdsToDelete });
      } catch {
        // Best-effort: don't block deletion if cleanup fails
      }

      await supabase
        .from('people')
        .update({ deleted_at: now })
        .in('id', personIdsToDelete);

      // Hard-delete relationships involving deleted people
      for (const pid of personIdsToDelete) {
        await supabase
          .from('relationships')
          .delete()
          .or(`person_a_id.eq.${pid},person_b_id.eq.${pid}`);
      }
    }

    // Soft-delete the interview itself
    const { error } = await supabase
      .from('interviews')
      .update({ deleted_at: now })
      .eq('id', id);

    if (error) throw error;

    // Refresh all data to get consistent state
    await get().fetchAllFamilyData();
  },

  deleteAllInterviews: async () => {
    const groupId = get().activeFamilyGroupId;
    if (!groupId) return;
    const now = new Date().toISOString();

    // Soft-delete all stories from interviews in this group
    const interviewIds = get().interviews.map((i) => i.id);
    if (interviewIds.length > 0) {
      await supabase
        .from('stories')
        .update({ deleted_at: now })
        .in('interview_id', interviewIds)
        .is('deleted_at', null);

      // Clean up avatar images from DO Spaces before soft-deleting
      const selfPersonId = useAuthStore.getState().profile?.self_person_id;
      const peopleToDelete = get().people.filter((p) => p.id !== selfPersonId);
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

      // Soft-delete all people in this group EXCEPT the user's self person
      let peopleQuery = supabase
        .from('people')
        .update({ deleted_at: now })
        .eq('family_group_id', groupId)
        .is('deleted_at', null);
      if (selfPersonId) {
        peopleQuery = peopleQuery.neq('id', selfPersonId);
      }
      await peopleQuery;

      // Hard-delete relationships involving deleted people
      const deletedPersonIds = get().people
        .filter((p) => p.id !== selfPersonId)
        .map((p) => p.id);
      for (const pid of deletedPersonIds) {
        await supabase
          .from('relationships')
          .delete()
          .or(`person_a_id.eq.${pid},person_b_id.eq.${pid}`);
      }
    }

    // Soft-delete all interviews
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
    const result = await invokeFunction<{ biography: string }>('generate-biography', { personId });
    
    // Update local state
    set((state) => ({
      people: state.people.map((p) =>
        p.id === personId ? { ...p, ai_biography: result.biography } : p
      ),
    }));

    return result.biography;
  },
}));
