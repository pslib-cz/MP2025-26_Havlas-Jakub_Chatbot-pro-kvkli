import csv
import pandas as pd
from collections import defaultdict
import itertools

def analyze_csv_records(input_file):
    """
    Analyze CSV records for non-null properties and generate statistics.
    """
    print(f"Loading {input_file}...")
    
    df = pd.read_csv(input_file, low_memory=False)
    
    print(f"Total records: {len(df)}")
    print(f"Columns: {list(df.columns)}\n")
    
    # All fields from the statistics
    all_fields = ['Identifier', 'Title', 'Author', 'Contributors', 'Publisher', 
                  'PublicationYear', 'ISBN', 'ISSN', 'Subjects', 'Description',
                  'Language', 'PhysicalDescription', 'Series', 'Notes', 
                  'RecordType', 'ContentType', 'MediaType', 'CarrierType']
    
    # Filter to only existing columns
    existing_fields = [f for f in all_fields if f in df.columns]
    
    print(f"=== Analyzing {len(existing_fields)} fields ===\n")
    
    # Count non-null values for each column
    print("=== Non-null counts per column ===")
    non_null_counts = df[existing_fields].count()
    for col, count in non_null_counts.items():
        percentage = (count / len(df)) * 100
        print(f"{col}: {count} ({percentage:.2f}%)")
    
    # Create full pairwise matrix
    print("\n=== Creating comprehensive pairwise matrix ===")
    matrix_data = []
    for field1 in existing_fields:
        row = []
        for field2 in existing_fields:
            if field1 == field2:
                # Diagonal: count of non-null values for this field
                row.append(df[field1].notna().sum())
            else:
                # Off-diagonal: count where both fields are non-null
                count = df[[field1, field2]].notna().all(axis=1).sum()
                row.append(count)
        matrix_data.append(row)
    
    matrix_df = pd.DataFrame(matrix_data, 
                            index=existing_fields, 
                            columns=existing_fields)
    
    print(matrix_df.to_string())
    
    # Analyze key combinations for ChromaDB
    print("\n\n=== ChromaDB Recommendations ===")
    
    # Essential fields analysis
    essential_combinations = {
        'Title + Description': ['Title', 'Description'],
        'Title + Author + Description': ['Title', 'Author', 'Description'],
        'Title + (Author OR Contributors)': 'special_author_or',
        'Title + Description + (Author OR Contributors)': 'special_desc_author_or',
        'Title + Author + Publisher': ['Title', 'Author', 'Publisher'],
        'Title + Subjects + Description': ['Title', 'Subjects', 'Description'],
        'Title + Subjects + (Author OR Contributors)': 'special_subjects_author_or',
        'All Core Fields': ['Title', 'Author', 'Description', 'Subjects', 'Publisher'],
        'All Core + (Author OR Contributors)': 'special_all_core'
    }
    
    print("\nKey field combinations:")
    for name, fields in essential_combinations.items():
        if isinstance(fields, str) and fields.startswith('special_'):
            # Handle special OR logic
            if fields == 'special_author_or':
                mask = df['Title'].notna() & (df['Author'].notna() | df['Contributors'].notna())
            elif fields == 'special_desc_author_or':
                mask = df['Title'].notna() & df['Description'].notna() & (df['Author'].notna() | df['Contributors'].notna())
            elif fields == 'special_subjects_author_or':
                mask = df['Title'].notna() & df['Subjects'].notna() & (df['Author'].notna() | df['Contributors'].notna())
            elif fields == 'special_all_core':
                mask = (df['Title'].notna() & df['Description'].notna() & 
                       df['Subjects'].notna() & df['Publisher'].notna() & 
                       (df['Author'].notna() | df['Contributors'].notna()))
            count = mask.sum()
        else:
            available_fields = [f for f in fields if f in df.columns]
            if available_fields:
                mask = df[available_fields].notna().all(axis=1)
                count = mask.sum()
            else:
                count = 0
        
        percentage = (count / len(df)) * 100
        print(f"{name}: {count} records ({percentage:.2f}%)")
    
    # ChromaDB recommendations
    print("\n" + "="*60)
    print("CHROMADB SELECTION RECOMMENDATIONS")
    print("="*60)
    
    print("\n📊 RECOMMENDED APPROACH:")
    print("\n1. ESSENTIAL FIELDS (100% coverage):")
    print("   - Identifier: Use as document ID")
    print("   - Title: Primary searchable content (100% present)")
    
    print("\n2. HIGH-VALUE FIELDS (>60% coverage):")
    print("   - Author (65.56%): Important for attribution")
    print("   - Publisher (88.97%): Good coverage")
    print("   - Language (96.14%): Excellent coverage")
    print("   - PhysicalDescription (94.44%): Very good")
    print("   - Subjects (59.19%): Useful for categorization")
    print("   - Notes (66.87%): Additional context")
    
    print("\n3. MEDIUM-VALUE FIELDS (20-60% coverage):")
    print("   - Contributors (35.91%): Supplementary")
    print("   - ISBN (35.80%): Good for books")
    print("   - Series (27.34%): Series information")
    
    print("\n4. LOW-VALUE FIELDS (<20% coverage) - SKIP:")
    print("   - Description (18.73%): Low but valuable when present")
    print("   - ISSN (9.72%): Very limited")
    print("   - ContentType, MediaType, CarrierType (~19%): Limited")
    
    print("\n📝 RECOMMENDED CHROMADB SCHEMA:")
    print("-" * 60)
    print("Document Content (for embeddings):")
    print("  Combine: Title + Description + Subjects + Author")
    print("\nMetadata to store:")
    print("  - identifier: Identifier")
    print("  - title: Title")
    print("  - author: Author")
    print("  - publisher: Publisher")
    print("  - publication_year: PublicationYear")
    print("  - subjects: Subjects")
    print("  - language: Language")
    print("  - isbn: ISBN (when available)")
    print("  - series: Series (when available)")
    
    print("\n💡 DATA FILTERING STRATEGY:")
    title_desc_author = df[['Title', 'Description', 'Author']].notna().all(axis=1).sum()
    title_desc = df[['Title', 'Description']].notna().all(axis=1).sum()
    title_author = df[['Title', 'Author']].notna().all(axis=1).sum()
    
    print(f"\nOption A (High Quality): Title + Description + Author")
    print(f"  Records: {title_desc_author} ({(title_desc_author/len(df)*100):.2f}%)")
    print(f"\nOption B (Good Quality): Title + Description")
    print(f"  Records: {title_desc} ({(title_desc/len(df)*100):.2f}%)")
    print(f"\nOption C (Maximum Coverage): Title + Author")
    print(f"  Records: {title_author} ({(title_author/len(df)*100):.2f}%)")
    print(f"\nOption D (All Records): Title only (mandatory field)")
    print(f"  Records: {len(df)} (100%)")
    
    print("\n🎯 FINAL RECOMMENDATION:")
    print("Use Option B or C depending on your needs:")
    print("- If quality > quantity: Option A or B (with Description)")
    print("- If coverage matters: Option C (Title + Author)")
    print("- For all records: Augment missing fields with Title only")
    
    # Save comprehensive matrix
    matrix_file = "field_combination_matrix_full.csv"
    matrix_df.to_csv(matrix_file)
    print(f"\n✅ Full matrix saved to: {matrix_file}")
    
    # Save detailed statistics
    stats_file = "field_statistics_detailed.csv"
    stats_df = pd.DataFrame({
        'Field': non_null_counts.index,
        'Non-null Count': non_null_counts.values,
        'Percentage': (non_null_counts.values / len(df)) * 100,
        'Null Count': len(df) - non_null_counts.values
    })
    stats_df.to_csv(stats_file, index=False)
    print(f"✅ Detailed statistics saved to: {stats_file}")
    
    return df, matrix_df, stats_df

if __name__ == "__main__":
    input_csv = "complete_records_fixed.csv"
    
    try:
        df, matrix, stats = analyze_csv_records(input_csv)
    except FileNotFoundError:
        print(f"Error: File '{input_csv}' not found.")
        print("Please run getCSVinfo.py first to create the fixed CSV file.")
    except KeyboardInterrupt:
        print("\n\nProcess interrupted by user.")
    except Exception as e:
        import traceback
        print(f"Error: {e}")
        print("\nFull traceback:")
        traceback.print_exc()
