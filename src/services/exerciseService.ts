import { supabase } from '@/lib/supabase';
import type { Exercise, ExerciseFormData, PatientRecommendedExercise, SelectedExercise } from '@/types/exercise';

export const exerciseService = {
    async getAll(): Promise<Exercise[]> {
        const { data, error } = await supabase
            .from('exercises')
            .select('*')
            .order('category', { ascending: true })
            .order('name', { ascending: true });
        if (error) { console.error('Get exercises error:', error); throw error; }
        return (data || []) as Exercise[];
    },

    async getActive(): Promise<Exercise[]> {
        const { data, error } = await supabase
            .from('exercises')
            .select('*')
            .eq('is_active', true)
            .order('category', { ascending: true })
            .order('name', { ascending: true });
        if (error) { console.error('Get active exercises error:', error); throw error; }
        return (data || []) as Exercise[];
    },

    async getByCondition(condition: string): Promise<Exercise[]> {
        const { data, error } = await supabase
            .from('exercises')
            .select('*')
            .eq('is_active', true)
            .or(`condition.eq.${condition},condition.eq.General,condition.is.null`)
            .order('category', { ascending: true })
            .order('name', { ascending: true });
        if (error) { console.error('Get exercises by condition error:', error); throw error; }
        return (data || []) as Exercise[];
    },

    async getById(id: number): Promise<Exercise | null> {
        const { data, error } = await supabase
            .from('exercises')
            .select('*')
            .eq('id', id)
            .single();
        if (error) { console.error('Get exercise error:', error); return null; }
        return data as Exercise;
    },

    async create(exercise: ExerciseFormData): Promise<Exercise> {
        const { data, error } = await supabase
            .from('exercises')
            .insert(exercise)
            .select()
            .single();
        if (error) { console.error('Create exercise error:', error); throw error; }
        return data as Exercise;
    },

    async update(id: number, exercise: Partial<ExerciseFormData>): Promise<Exercise> {
        const { data, error } = await supabase
            .from('exercises')
            .update(exercise)
            .eq('id', id)
            .select()
            .single();
        if (error) { console.error('Update exercise error:', error); throw error; }
        return data as Exercise;
    },

    async delete(id: number): Promise<void> {
        const { error } = await supabase
            .from('exercises')
            .delete()
            .eq('id', id);
        if (error) { console.error('Delete exercise error:', error); throw error; }
    },

    async toggleActive(id: number, isActive: boolean): Promise<void> {
        const { error } = await supabase
            .from('exercises')
            .update({ is_active: !isActive })
            .eq('id', id);
        if (error) { console.error('Toggle exercise error:', error); throw error; }
    },

    async uploadFile(file: File, folder: string): Promise<string> {
        const fileExt = file.name.split('.').pop();
        const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error } = await supabase.storage
            .from('exercise-files')
            .upload(fileName, file);
        if (error) { console.error('Upload file error:', error); throw error; }

        const { data: urlData } = supabase.storage
            .from('exercise-files')
            .getPublicUrl(fileName);

        return urlData.publicUrl;
    },

    async deleteFile(url: string): Promise<void> {
        const path = url.split('/exercise-files/')[1];
        if (!path) return;
        const { error } = await supabase.storage
            .from('exercise-files')
            .remove([path]);
        if (error) console.error('Delete file error:', error);
    },

    // ── Patient Recommended Exercises ──

    async getPatientExercises(patientId: string): Promise<PatientRecommendedExercise[]> {
        const { data, error } = await supabase
            .from('patient_recommended_exercises')
            .select('*, exercise:exercises(*)')
            .eq('patient_id', patientId);
        if (error) { console.error('Get patient exercises error:', error); return []; }
        return (data || []) as PatientRecommendedExercise[];
    },

    async savePatientExercises(patientId: string, exercises: SelectedExercise[]): Promise<void> {
        // Capture the ids of the existing recommendations so the old plan is only
        // removed after the new rows are safely stored (insert first, delete after).
        const { data: existing, error: fetchError } = await supabase
            .from('patient_recommended_exercises')
            .select('id')
            .eq('patient_id', patientId);
        if (fetchError) { console.error('Fetch patient exercises error:', fetchError); throw fetchError; }

        // Insert new recommendations
        if (exercises.length > 0) {
            const records = exercises.map(ex => ({
                patient_id: patientId,
                exercise_id: ex.exercise.id!,
                times: ex.times || null,
                repetitions: ex.repetitions || null,
                sets: ex.sets || null,
                hold: ex.hold || null,
                notes: ex.notes || null,
            }));

            const { error: insertError } = await supabase
                .from('patient_recommended_exercises')
                .insert(records);
            if (insertError) { console.error('Insert patient exercises error:', insertError); throw insertError; }
        }

        // Delete only the old rows (never the just-inserted ones)
        const oldIds = (existing || []).map(r => r.id);
        if (oldIds.length === 0) return;

        const { error: deleteError } = await supabase
            .from('patient_recommended_exercises')
            .delete()
            .in('id', oldIds);
        if (deleteError) { console.error('Delete patient exercises error:', deleteError); throw deleteError; }
    },
};
